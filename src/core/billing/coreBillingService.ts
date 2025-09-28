import { getMainClient } from '../../shared/database/mainClient';
import { getTenantClient } from '../../shared/database/tenantClient';
import { decrypt } from '../../shared/utils/encryption';
import { Decimal } from '@prisma/client/runtime/library';
import pino from 'pino';

const logger = pino();

export interface BillingCalculation {
  userCount: number;
  applicationCount: number;
  userAmount: Decimal;
  applicationAmount: Decimal;
  totalAmount: Decimal;
  periodStart: Date;
  periodEnd: Date;
}

export interface ProratedCalculation {
  userCount: number;
  daysRemaining: number;
  proratedAmount: Decimal;
  nextBillingDate: Date;
}

export class CoreBillingService {
  private mainClient = getMainClient();

  /**
   * Create a new subscription for a project
   */
  async createSubscription(
    projectId: string,
    userId: string,
    userPricePerMonth: number = 10.00,
    applicationPricePerMonth: number = 0.00
  ) {
    const nextBilling = this.getNextBillingDate();
    
    const subscription = await this.mainClient.subscription.create({
      data: {
        projectId,
        userId,
        userPricePerMonth,
        applicationPricePerMonth,
        nextBilling,
      },
    });

    logger.info({
      subscriptionId: subscription.id,
      projectId,
      userId,
    }, 'Subscription created');

    return subscription;
  }

  /**
   * Calculate billing for a project
   */
  async calculateBilling(projectId: string): Promise<BillingCalculation> {
    // Get project details
    const project = await this.mainClient.project.findUnique({
      where: { id: projectId },
      include: {
        tenantApplications: {
          where: { isActive: true },
          include: {
            application: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Get subscription
    const subscription = await this.mainClient.subscription.findFirst({
      where: {
        projectId,
        isActive: true,
      },
    });

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Get user count from tenant database
    const tenantClient = getTenantClient(project.dbConnectionString);
    const userCount = await tenantClient.tenantUser.count({
      where: { isActive: true },
    });

    // Calculate amounts
    const userAmount = new Decimal(userCount).mul(subscription.userPricePerMonth);
    
    // Calculate application amount based on tenant's selected applications
    let applicationAmount = new Decimal(0);
    for (const tenantApp of project.tenantApplications) {
      const appPrice = tenantApp.customPrice || tenantApp.application.pricePerMonth;
      applicationAmount = applicationAmount.add(appPrice);
    }
    
    const totalAmount = userAmount.add(applicationAmount);

    const periodStart = subscription.lastBilled || subscription.createdAt;
    const periodEnd = new Date();

    return {
      userCount,
      applicationCount: project.tenantApplications.length,
      userAmount,
      applicationAmount,
      totalAmount,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Get available applications for tenant selection
   */
  async getAvailableApplications(): Promise<any[]> {
    const applications = await this.mainClient.application.findMany({
      where: { 
        isActive: true,
        listed: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        pricePerMonth: true,
      },
    });

    return applications;
  }

  /**
   * Generate monthly invoice for a project
   */
  async generateMonthlyInvoice(projectId: string) {
    const calculation = await this.calculateBilling(projectId);
    const subscription = await this.mainClient.subscription.findFirst({
      where: {
        projectId,
        isActive: true,
      },
    });

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    const invoiceNumber = this.generateInvoiceNumber();
    const dueDate = this.getNextBillingDate();

    const invoice = await this.mainClient.invoice.create({
      data: {
        subscriptionId: subscription.id,
        projectId,
        invoiceNumber,
        amount: calculation.totalAmount,
        userCount: calculation.userCount,
        applicationCount: calculation.applicationCount,
        userAmount: calculation.userAmount,
        applicationAmount: calculation.applicationAmount,
        periodStart: calculation.periodStart,
        periodEnd: calculation.periodEnd,
        dueDate,
      },
    });

    // Update subscription next billing date
    await this.mainClient.subscription.update({
      where: { id: subscription.id },
      data: {
        lastBilled: new Date(),
        nextBilling: this.getNextBillingDate(),
      },
    });

    logger.info({
      invoiceId: invoice.id,
      projectId,
      amount: calculation.totalAmount.toString(),
    }, 'Monthly invoice generated');

    return invoice;
  }

  /**
   * Add application to tenant
   */
  async addApplicationToTenant(projectId: string, applicationId: string, customPrice?: number) {
    const tenantApplication = await this.mainClient.tenantApplication.create({
      data: {
        projectId,
        applicationId,
        customPrice: customPrice ? new Decimal(customPrice) : null,
      },
      include: {
        application: true,
      },
    });

    logger.info({
      projectId,
      applicationId,
      customPrice,
    }, 'Application added to tenant');

    return tenantApplication;
  }

  /**
   * Remove application from tenant
   */
  async removeApplicationFromTenant(projectId: string, applicationId: string) {
    await this.mainClient.tenantApplication.deleteMany({
      where: {
        projectId,
        applicationId,
      },
    });

    logger.info({
      projectId,
      applicationId,
    }, 'Application removed from tenant');
  }

  /**
   * Process payment for an invoice
   */
  async processPayment(invoiceId: string, paymentMethod: string = 'stripe') {
    const invoice = await this.mainClient.invoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new Error('Invoice already paid');
    }

    // Update invoice status
    await this.mainClient.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    // Ensure project remains active
    await this.mainClient.project.update({
      where: { id: invoice.projectId },
      data: { isActive: true },
    });

    logger.info({
      invoiceId,
      projectId: invoice.projectId,
      amount: invoice.amount.toString(),
    }, 'Payment processed successfully');

    return invoice;
  }

  /**
   * Check for overdue invoices and deactivate projects
   */
  async checkOverdueInvoices() {
    const now = new Date();
    const overdueInvoices = await this.mainClient.invoice.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: now },
      },
      include: { project: true },
    });

    for (const invoice of overdueInvoices) {
      // Mark invoice as overdue
      await this.mainClient.invoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE' },
      });

      // Deactivate project
      await this.mainClient.project.update({
        where: { id: invoice.projectId },
        data: { isActive: false },
      });

      logger.warn({
        invoiceId: invoice.id,
        projectId: invoice.projectId,
        projectName: invoice.project.name,
        dueDate: invoice.dueDate,
      }, 'Project deactivated due to overdue invoice');
    }

    return overdueInvoices.length;
  }

  /**
   * Get billing status for a project
   */
  async getBillingStatus(projectId: string) {
    const subscription = await this.mainClient.subscription.findFirst({
      where: {
        projectId,
        isActive: true,
      },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!subscription) {
      return null;
    }

    const project = await this.mainClient.project.findUnique({
      where: { id: projectId },
      include: {
        tenantApplications: {
          where: { isActive: true },
        },
      },
    });

    //const decryptedConnectionString = decrypt(project!.dbConnectionString);
    //const tenantClient = getTenantClient(decryptedConnectionString);
    const userCount = await this.mainClient.userProject.count({
      where: {
        projectId,
      },
    });

    return {
      subscription,
      project,
      userCount,
      applicationCount: project!.tenantApplications.length,
      nextBilling: subscription.nextBilling,
      isActive: project!.isActive,
    };
  }

  /**
   * Get next billing date (last day of current month)
   */
  private getNextBillingDate(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return nextMonth;
  }

  /**
   * Generate unique invoice number
   */
  private generateInvoiceNumber(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `INV-${timestamp}-${random}`.toUpperCase();
  }
}

export const coreBillingService = new CoreBillingService();
