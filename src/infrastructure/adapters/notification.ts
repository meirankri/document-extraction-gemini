import nodemailer from "nodemailer";
import { MedicalInfo } from "../../domain/models";
import { NotificationPort } from "../../domain/ports";
import { Attachment } from "nodemailer/lib/mailer";

export class EmailNotificationService implements NotificationPort {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    smtpConfig: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    },
    private readonly emailConfig: {
      from: string;
      to: string;
    }
  ) {
    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  async notifyMissingInformation(
    documentId: string,
    missingFields: string[],
    partialInfo: Partial<MedicalInfo>
  ): Promise<void> {
    const htmlContent = `
            <h2>Document Information Incomplete</h2>
            <p>Document ID: ${documentId}</p>
            <h3>Missing Fields:</h3>
            <ul>${missingFields
              .map((field) => `<li>${field}</li>`)
              .join("")}</ul>
            <h3>Extracted Information:</h3>
            <table style="border-collapse: collapse; width: 100%;">
                ${Object.entries(partialInfo)
                  .map(
                    ([key, value]) => `
                        <tr>
                            <td style="border: 1px solid #ddd; padding: 8px;">${key}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;">${
                              value || "N/A"
                            }</td>
                        </tr>
                    `
                  )
                  .join("")}
            </table>`;

    await this.transporter.sendMail({
      from: this.emailConfig.from,
      to: this.emailConfig.to,
      subject: `Missing Information - Document ${documentId}`,
      html: htmlContent,
    });
  }
}

export class NotificationServiceAdapter implements NotificationPort {
  constructor(
    private readonly notificationService: NotificationPort,
    private readonly isLoggingOnly: boolean = true
  ) {}

  async notifyMissingInformation(
    documentId: string,
    missingFields: string[],
    partialInfo: Partial<MedicalInfo>,
    attachment?: Attachment
  ): Promise<void> {
    if (this.isLoggingOnly) {
      console.log("=== EMAIL NOTIFICATION ===");
      console.log("Document ID:", documentId);
      console.log("Missing Fields:", missingFields);
      console.log("Partial Info:", partialInfo);
      console.log("========================");
    } else {
      await this.notificationService.notifyMissingInformation(
        documentId,
        missingFields,
        partialInfo,
        attachment
      );
    }
  }
}
