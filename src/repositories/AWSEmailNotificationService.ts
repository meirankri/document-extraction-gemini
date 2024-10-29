import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { MedicalInfo } from "../domain/models";
import { NotificationPort } from "../domain/ports";
export class AWSEmailNotificationService implements NotificationPort {
    private readonly sesClient: SESClient;

    constructor(
        private readonly emailConfig: {
            from: string;
            to: string;
            region: string;
            credentials: {
                accessKeyId: string;
                secretAccessKey: string;
            }
        }
    ) {
        this.sesClient = new SESClient({
            region: this.emailConfig.region,
            credentials: this.emailConfig.credentials
        });
    }

    async notifyMissingInformation(
        documentId: string,
        missingFields: string[],
        partialInfo: Partial<MedicalInfo>
    ): Promise<any> {
        const htmlContent = `
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

        const rawEmail = `From: ${this.emailConfig.from}
To: ${this.emailConfig.to}
Subject: Missing Information - Document ${documentId}
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

${htmlContent}`;

        const command = new SendRawEmailCommand({
            RawMessage: {
                Data: Buffer.from(rawEmail)
            }
        });

        const response = await this.sesClient.send(command);
        console.log('Notification sent:', response);
        
        return response;
    }
}