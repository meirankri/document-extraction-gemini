import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { MedicalInfo } from "../../domain/models";
import { NotificationPort } from "../../domain/ports";

interface SESConfig {
    from: string;
    to: string;
    region: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    }
}

export class SESNotificationAdapter implements NotificationPort {
    private readonly sesClient: SESClient;
    private readonly config: SESConfig;

    constructor(config: SESConfig) {
        this.config = config;
        this.sesClient = new SESClient({
            region: this.config.region,
            credentials: this.config.credentials
        });
    }

    async notifyMissingInformation(
        documentId: string,
        missingFields: string[],
        partialInfo: Partial<MedicalInfo>
    ): Promise<any> {
        const emailContent = this.buildEmailContent(documentId, missingFields, partialInfo);
        const rawEmail = this.buildRawEmail(documentId, emailContent);
        
        const command = new SendRawEmailCommand({
            RawMessage: {
                Data: Buffer.from(rawEmail)
            }
        });

        try {
            const response = await this.sesClient.send(command);
            return response;
        } catch (error) {
            console.error('SES notification error:', error);
            throw new Error('Failed to send SES notification');
        }
    }

    private buildEmailContent(
        documentId: string,
        missingFields: string[],
        partialInfo: Partial<MedicalInfo>
    ): string {
        return `
            <h2>Document Information Incomplete</h2>
            <p>Document ID: ${documentId}</p>
            
            <h3>Missing Fields:</h3>
            <ul>
              ${missingFields.map(field => `<li>${field}</li>`).join('')}
            </ul>
      
            <h3>Extracted Information:</h3>
            <table style="border-collapse: collapse; width: 100%;">
              ${Object.entries(partialInfo)
                .map(([key, value]) => `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${key}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${value || 'N/A'}</td>
                  </tr>
                `).join('')}
            </table>
        `;
    }

    private buildRawEmail(documentId: string, htmlContent: string): string {
        return `From: ${this.config.from}
To: ${this.config.to}
Subject: Missing Information - Document ${documentId}
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

${htmlContent}`;
    }
}