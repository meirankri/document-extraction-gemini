import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { logger } from "../utils/logger";

const client = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export const sendEmailWithAttachment = async ({
  mailTo,
  emailContent,
  emailSubject,
  file,
}: {
  mailTo: string;
  emailContent: string;
  emailSubject: string;
  file: string | null;
}) => {
  const sender = process.env.MAIL_FROM || "";

  const rawEmail = `From: ${sender}
To: ${mailTo}
Subject: ${emailSubject}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="NextPart"

--NextPart
Content-Type: text/plain

${emailContent}

--NextPart
Content-Type: application/pdf; name="attachment.pdf"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="attachment.pdf"

${file}

--NextPart--
`;
  const emailBuffer = new TextEncoder().encode(rawEmail);

  const params = {
    RawMessage: { Data: emailBuffer },
  };

  return client
    .send(new SendRawEmailCommand(params))
    .then(() => {
      return true;
    })
    .catch((error) => {
      logger({
        message: "Error sending email",
        context: error,
      }).error();
      return false;
    });
};
