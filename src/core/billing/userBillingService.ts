import { getMainClient } from '../../shared/database/mainClient';
import { getTenantClient } from '../../shared/database/tenantClient';
import { billingAutomationService } from './billingAutomationService';
import { eventBus, EventNames } from '../event-bus';
import pino from 'pino';

const logger = pino();

export class UserBillingService {
  private mainClient = getMainClient();

  /**
   * Handle when a new user is added to a project
   * Note: No prorated billing - users pay full monthly price regardless of when added
   */
  async handleUserAdded(projectId: string, userId: string) {
    try {
      // Check if project has an active subscription
      const subscription = await this.mainClient.subscription.findFirst({
        where: {
          projectId,
          isActive: true,
        },
      });

      if (!subscription) {
        logger.warn({
          projectId,
          userId,
        }, 'No active subscription found for project');
        return;
      }

      // No immediate billing - user will be included in next monthly billing cycle
      logger.info({
        projectId,
        userId,
      }, 'User added to project - will be billed in next monthly cycle');

      // Publish event for user addition
      await eventBus.publish(EventNames.USER_REGISTERED, {
        projectId,
        userId,
        action: 'added_to_project',
      });

    } catch (error) {
      logger.error({
        projectId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to process user addition');

      throw error;
    }
  }

  /**
   * Handle billing when a user is removed from a project
   */
  async handleUserRemoved(projectId: string, userId: string) {
    try {
      // For user removal, we don't generate immediate credits
      // The next monthly billing will automatically reflect the reduced user count
      
      logger.info({
        projectId,
        userId,
      }, 'User removed from project, billing will be adjusted in next monthly cycle');

      // Publish event for user removal
      await eventBus.publish(EventNames.USER_LOGOUT, {
        projectId,
        userId,
        action: 'removed_from_project',
      });

    } catch (error) {
      logger.error({
        projectId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to process user removal billing');

      throw error;
    }
  }

  /**
   * Get current user count for a project
   */
  async getUserCount(projectId: string): Promise<number> {
    try {
      const project = await this.mainClient.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      const tenantClient = getTenantClient(project.dbConnectionString);
      const userCount = await tenantClient.user.count({
        where: { isActive: true },
      });

      return userCount;
    } catch (error) {
      logger.error({
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to get user count');

      throw error;
    }
  }

  /**
   * Get billing summary for a project
   */
  async getBillingSummary(projectId: string) {
    try {
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
            include: {
              application: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      const userCount = await this.getUserCount(projectId);
      const applicationCount = project.tenantApplications.length;

      // Calculate current month's estimated cost
      const userAmount = subscription.userPricePerMonth.mul(userCount);
      const applicationAmount = project.tenantApplications.reduce((sum, app) => {
        const appPrice = app.customPrice || app.application.pricePerMonth;
        return sum.add(appPrice);
      }, subscription.applicationPricePerMonth);

      const totalEstimatedCost = userAmount.add(applicationAmount);

      return {
        subscription: {
          id: subscription.id,
          userPricePerMonth: subscription.userPricePerMonth.toString(),
          applicationPricePerMonth: subscription.applicationPricePerMonth.toString(),
          nextBilling: subscription.nextBilling,
          isActive: subscription.isActive,
        },
        currentUsage: {
          userCount,
          applicationCount,
          userAmount: userAmount.toString(),
          applicationAmount: applicationAmount.toString(),
          totalEstimatedCost: totalEstimatedCost.toString(),
        },
        recentInvoices: subscription.invoices.map(invoice => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount.toString(),
          status: invoice.status,
          dueDate: invoice.dueDate,
          createdAt: invoice.createdAt,
        })),
        project: {
          id: project.id,
          name: project.name,
          isActive: project.isActive,
        },
      };
    } catch (error) {
      logger.error({
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to get billing summary');

      throw error;
    }
  }

  /**
   * Check if project has overdue payments
   */
  async hasOverduePayments(projectId: string): Promise<boolean> {
    try {
      const overdueInvoices = await this.mainClient.invoice.findFirst({
        where: {
          projectId,
          status: 'OVERDUE',
        },
      });

      return !!overdueInvoices;
    } catch (error) {
      logger.error({
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to check overdue payments');

      return false;
    }
  }

  /**
   * Get prorated amount for a new user
   */
  async getProratedAmount(projectId: string): Promise<{
    daysRemaining: number;
    proratedAmount: string;
    nextBillingDate: Date;
  }> {
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

      const now = new Date();
      const nextBilling = this.getNextBillingDate();
      const daysRemaining = Math.ceil((nextBilling.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      const dailyRate = subscription.userPricePerMonth.div(30);
      const proratedAmount = dailyRate.mul(daysRemaining);

      return {
        daysRemaining,
        proratedAmount: proratedAmount.toString(),
        nextBillingDate: nextBilling,
      };
    } catch (error) {
      logger.error({
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to calculate prorated amount');

      throw error;
    }
  }

  /**
   * Get next billing date (last day of current month)
   */
  private getNextBillingDate(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return nextMonth;
  }
}

export const userBillingService = new UserBillingService();
