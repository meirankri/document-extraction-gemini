import * as nodemailer from "nodemailer";
import { MedicalInfo } from "../../domain/models";
import { NotificationPort } from "../../domain/ports";
import { logger } from "../../utils/logger";

interface SMTPConfig {
  from: string;
  to: string;
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface Attachment {
  filename: string;
  path?: string;
  content?: Buffer;
}

export class SMTPNotificationAdapter implements NotificationPort {
  private readonly transporter: nodemailer.Transporter;
  private readonly config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    });
  }

  async notifyMissingInformation(
    documentId: string,
    missingFields: string[],
    partialInfo: Partial<MedicalInfo>,
    attachment?: Attachment
  ): Promise<any> {
    const emailContent = this.buildEmailContent(
      documentId,
      missingFields,
      partialInfo
    );

    try {
      const mailOptions = {
        from: this.config.from,
        to: this.config.to,
        subject: `Missing Information - Document ${documentId}`,
        html: emailContent,
        attachments: attachment
          ? [
              {
                filename: attachment.filename,
                content: attachment.content,
                path: attachment.path,
              },
            ]
          : undefined,
      };

      const response = await this.transporter.sendMail(mailOptions);
      return response;
    } catch (error) {
      logger({
        message: "SMTP notification error",
        context: error,
      }).error();
      throw new Error("Failed to send SMTP notification");
    }
  }

  private buildEmailContent(
    documentId: string,
    missingFields: string[],
    partialInfo: Partial<MedicalInfo>
  ): string {
    const usedCategory = partialInfo.usedCategory || "default";

    return `
            <h2>Document Information Incomplete</h2>
            <p>Document ID: ${documentId}</p>
            
            <h3>Catégorie utilisée: <span style="color: ${
              usedCategory === "default" ? "#ff9900" : "#009900"
            };">${usedCategory}</span></h3>
            
            <h3>Missing Fields:</h3>
            <ul>
              ${missingFields.map((field) => `<li>${field}</li>`).join("")}
            </ul>
      
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
            </table>
        `;
  }
}
