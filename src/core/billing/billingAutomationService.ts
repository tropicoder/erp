import { getMainClient } from '../../shared/database/mainClient';
import { coreBillingService } from './coreBillingService';
import { eventBus, EventNames } from '../event-bus';
import { Decimal } from '@prisma/client/runtime/library';
import pino from 'pino';

const logger = pino();

export class BillingAutomationService {
  private mainClient = getMainClient();

  /**
   * Process monthly billing for all active subscriptions
   */
  async processMonthlyBilling() {
    logger.info('Starting monthly billing process');

    const activeSubscriptions = await this.mainClient.subscription.findMany({
      where: { isActive: true },
      include: { project: true },
    });

    let processedCount = 0;
    let errorCount = 0;

    for (const subscription of activeSubscriptions) {
      try {
        // Generate monthly invoice
        const invoice = await coreBillingService.generateMonthlyInvoice(subscription.projectId);

        // Publish billing event
        await eventBus.publish(EventNames.BILLING_INVOICE_GENERATED, {
          subscriptionId: subscription.id,
          projectId: subscription.projectId,
          invoiceId: invoice.id,
          amount: invoice.amount.toString(),
          dueDate: invoice.dueDate,
        });

        processedCount++;
        logger.info({
          subscriptionId: subscription.id,
          projectId: subscription.projectId,
          invoiceId: invoice.id,
        }, 'Monthly invoice generated');

      } catch (error) {
        errorCount++;
        logger.error({
          subscriptionId: subscription.id,
          projectId: subscription.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to generate monthly invoice');
      }
    }

    // Check for overdue invoices and deactivate projects
    const overdueCount = await coreBillingService.checkOverdueInvoices();

    logger.info({
      processedCount,
      errorCount,
      overdueCount,
    }, 'Monthly billing process completed');

    return {
      processedCount,
      errorCount,
      overdueCount,
    };
  }

  /**
   * Add application to tenant
   */
  async addApplicationToTenant(projectId: string, applicationId: string, customPrice?: number) {
    try {
      const tenantApplication = await coreBillingService.addApplicationToTenant(projectId, applicationId, customPrice);

      // Publish event
      await eventBus.publish(EventNames.BILLING_APPLICATION_INVOICE_GENERATED, {
        projectId,
        applicationId,
        action: 'added',
        customPrice,
      });

      logger.info({
        projectId,
        applicationId,
        customPrice,
      }, 'Application added to tenant');

      return tenantApplication;
    } catch (error) {
      logger.error({
        projectId,
        applicationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to add application to tenant');

      throw error;
    }
  }

  /**
   * Process application billing when an application is added/removed
   */
  async processApplicationBilling(projectId: string, applicationId: string, action: 'added' | 'removed') {
    try {
      const subscription = await this.mainClient.subscription.findFirst({
        where: {
          projectId,
          isActive: true,
        },
      });

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      const application = await this.mainClient.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new Error('Application not found');
      }

      // Calculate prorated amount for the application
      const now = new Date();
      const nextBilling = this.getNextBillingDate();
      const daysRemaining = Math.ceil((nextBilling.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      const dailyRate = application.pricePerMonth.div(30);
      const proratedAmount = dailyRate.mul(daysRemaining);

      if (action === 'added') {
        // Generate prorated invoice for application
        const invoice = await this.mainClient.invoice.create({
          data: {
            subscriptionId: subscription.id,
            projectId,
            invoiceNumber: this.generateInvoiceNumber(),
            amount: proratedAmount,
            userCount: 0,
            applicationCount: 1,
            userAmount: new Decimal(0),
            applicationAmount: proratedAmount,
            periodStart: now,
            periodEnd: nextBilling,
            dueDate: nextBilling,
          },
        });

        await eventBus.publish(EventNames.BILLING_APPLICATION_INVOICE_GENERATED, {
          projectId,
          applicationId,
          invoiceId: invoice.id,
          amount: proratedAmount.toString(),
          action,
        });

        logger.info({
          projectId,
          applicationId,
          invoiceId: invoice.id,
          amount: proratedAmount.toString(),
        }, 'Application billing processed');

        return invoice;
      }

      logger.info({
        projectId,
        applicationId,
        action,
      }, 'Application billing processed (removed)');

      return null;

    } catch (error) {
      logger.error({
        projectId,
        applicationId,
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to process application billing');

      throw error;
    }
  }

  /**
   * Get billing statistics
   */
  async getBillingStatistics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [
      totalSubscriptions,
      activeSubscriptions,
      totalInvoices,
      paidInvoices,
      overdueInvoices,
      totalRevenue,
    ] = await Promise.all([
      this.mainClient.subscription.count(),
      this.mainClient.subscription.count({ where: { isActive: true } }),
      this.mainClient.invoice.count(),
      this.mainClient.invoice.count({ where: { status: 'PAID' } }),
      this.mainClient.invoice.count({ where: { status: 'OVERDUE' } }),
      this.mainClient.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    const monthlyRevenue = await this.mainClient.invoice.aggregate({
      where: {
        status: 'PAID',
        paidAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _sum: { amount: true },
    });

    return {
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        inactive: totalSubscriptions - activeSubscriptions,
      },
      invoices: {
        total: totalInvoices,
        paid: paidInvoices,
        overdue: overdueInvoices,
        pending: totalInvoices - paidInvoices - overdueInvoices,
      },
      revenue: {
        total: totalRevenue._sum.amount || 0,
        monthly: monthlyRevenue._sum.amount || 0,
      },
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

export const billingAutomationService = new BillingAutomationService();
