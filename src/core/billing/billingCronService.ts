import { billingAutomationService } from './billingAutomationService';
import { coreBillingService } from './coreBillingService';
import { eventBus, EventNames } from '../event-bus';
import pino from 'pino';

const logger = pino();

export class BillingCronService {
  private isRunning = false;

  /**
   * Start the billing cron service
   * This should be called once when the application starts
   */
  start() {
    logger.info('Starting billing cron service');

    // Run monthly billing on the last day of each month at 23:59
    this.scheduleMonthlyBilling();

    // Check for overdue invoices every hour
    this.scheduleOverdueCheck();

    logger.info('Billing cron service started');
  }

  /**
   * Stop the billing cron service
   */
  stop() {
    logger.info('Stopping billing cron service');
    this.isRunning = false;
  }

  /**
   * Schedule monthly billing process
   */
  private scheduleMonthlyBilling() {
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const nextBillingDate = new Date(lastDayOfMonth);
    nextBillingDate.setHours(23, 59, 0, 0);

    // If we're past the last day of this month, schedule for next month
    if (now > nextBillingDate) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      nextBillingDate.setMonth(nextMonth.getMonth());
      nextBillingDate.setFullYear(nextMonth.getFullYear());
    }

    const timeUntilNextBilling = nextBillingDate.getTime() - now.getTime();

    logger.info({
      nextBillingDate: nextBillingDate.toISOString(),
      timeUntilNextBilling: Math.round(timeUntilNextBilling / (1000 * 60 * 60 * 24)) + ' days',
    }, 'Monthly billing scheduled');

    setTimeout(() => {
      this.runMonthlyBilling();
      // Schedule the next month
      this.scheduleMonthlyBilling();
    }, timeUntilNextBilling);
  }

  /**
   * Schedule overdue invoice check
   */
  private scheduleOverdueCheck() {
    // Check every hour
    const oneHour = 60 * 60 * 1000;

    setInterval(() => {
      this.checkOverdueInvoices();
    }, oneHour);

    logger.info('Overdue invoice check scheduled (every hour)');
  }

  /**
   * Run monthly billing process
   */
  private async runMonthlyBilling() {
    if (this.isRunning) {
      logger.warn('Monthly billing already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      logger.info('Starting monthly billing process');

      const result = await billingAutomationService.processMonthlyBilling();

      // Publish system event
      await eventBus.publish(EventNames.SYSTEM_STARTUP, {
        type: 'monthly_billing_completed',
        processedCount: result.processedCount,
        errorCount: result.errorCount,
        overdueCount: result.overdueCount,
        timestamp: new Date(),
      });

      logger.info({
        processedCount: result.processedCount,
        errorCount: result.errorCount,
        overdueCount: result.overdueCount,
      }, 'Monthly billing process completed');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Monthly billing process failed');

      // Publish error event
      await eventBus.publish(EventNames.SYSTEM_SHUTDOWN, {
        type: 'monthly_billing_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check for overdue invoices and deactivate projects
   */
  private async checkOverdueInvoices() {
    try {
      const overdueCount = await coreBillingService.checkOverdueInvoices();

      if (overdueCount > 0) {
        logger.warn({
          overdueCount,
        }, 'Found overdue invoices, projects may have been deactivated');

        // Publish event for overdue invoices
        await eventBus.publish(EventNames.BILLING_PROJECT_DEACTIVATED, {
          overdueCount,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to check overdue invoices');
    }
  }

  /**
   * Manually trigger monthly billing (for testing or manual runs)
   */
  async triggerMonthlyBilling() {
    logger.info('Manually triggering monthly billing');
    await this.runMonthlyBilling();
  }

  /**
   * Manually trigger overdue check (for testing or manual runs)
   */
  async triggerOverdueCheck() {
    logger.info('Manually triggering overdue check');
    await this.checkOverdueInvoices();
  }

  /**
   * Get billing cron service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextBillingDate: this.getNextBillingDate(),
      timeUntilNextBilling: this.getTimeUntilNextBilling(),
    };
  }

  /**
   * Get next billing date
   */
  private getNextBillingDate(): Date {
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const nextBillingDate = new Date(lastDayOfMonth);
    nextBillingDate.setHours(23, 59, 0, 0);

    // If we're past the last day of this month, return next month
    if (now > nextBillingDate) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      nextBillingDate.setMonth(nextMonth.getMonth());
      nextBillingDate.setFullYear(nextMonth.getFullYear());
    }

    return nextBillingDate;
  }

  /**
   * Get time until next billing in milliseconds
   */
  private getTimeUntilNextBilling(): number {
    const now = new Date();
    const nextBillingDate = this.getNextBillingDate();
    return nextBillingDate.getTime() - now.getTime();
  }
}

export const billingCronService = new BillingCronService();
