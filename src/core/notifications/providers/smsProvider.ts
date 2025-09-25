import { NotificationProvider, NotificationData, NotificationResult } from '../notificationService';
import pino from 'pino';

const logger = pino();

/**
 * SMS notification provider (placeholder implementation)
 * In production, this would integrate with services like Twilio, AWS SNS, etc.
 */
export class SMSProvider implements NotificationProvider {
  name = 'sms';

  /**
   * Send SMS notification
   * @param notification - The notification to send
   * @returns Promise with the result
   */
  async send(notification: NotificationData): Promise<NotificationResult> {
    try {
      // Simulate SMS sending
      await this.simulateSMSSending(notification);

      const messageId = `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      logger.info({
        recipient: notification.recipient,
        messageId,
      }, 'SMS sent successfully (simulated)');

      return {
        success: true,
        messageId,
        provider: this.name,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        recipient: notification.recipient,
        error: errorMessage,
      }, 'SMS sending failed');

      return {
        success: false,
        error: errorMessage,
        provider: this.name,
      };
    }
  }

  /**
   * Validate SMS notification data
   * @param notification - The notification to validate
   * @returns True if valid
   */
  validate(notification: NotificationData): boolean {
    if (notification.type !== 'sms') {
      return false;
    }

    if (!notification.recipient) {
      return false;
    }

    // Basic phone number validation (simplified)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(notification.recipient.replace(/[\s-()]/g, ''))) {
      return false;
    }

    if (!notification.body) {
      return false;
    }

    // SMS body length validation (160 characters for single SMS)
    if (notification.body.length > 160) {
      return false;
    }

    return true;
  }

  /**
   * Simulate SMS sending (placeholder)
   * @param notification - The notification to send
   */
  private async simulateSMSSending(notification: NotificationData): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    // Simulate occasional failures (3% chance)
    if (Math.random() < 0.03) {
      throw new Error('Simulated SMS sending failure');
    }

    // Log the SMS content (in production, this would be sent to actual SMS service)
    logger.debug({
      to: notification.recipient,
      body: notification.body,
      metadata: notification.metadata,
    }, 'SMS content (simulated)');
  }
}
