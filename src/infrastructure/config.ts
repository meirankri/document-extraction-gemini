import { createPool, Pool } from "mysql2/promise";

export class Database {
  private static pool: Pool;

  static initialize(config: {
    host: string;
    user: string;
    password: string;
    database: string;
    port: number;
  }): void {
    this.pool = createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  static getPool(): Pool {
    if (!this.pool) {
      throw new Error("Database not initialized");
    }
    return this.pool;
  }

  static async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export interface Config {
  database: {
    host: string;
    user: string;
    password: string;
    database: string;
    port: number;
  };
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  email: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    config: {
      from: string;
      to: string;
    };
  };
  api: {
    geminiApiKey: string;
    externalApiUrl: string;
  };
  server: {
    port: number;
  };
}

export function loadConfig(): Config {
  return {
    database: {
      host: process.env.DB_HOST!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      port: parseInt(process.env.DB_PORT!),
    },
    aws: {
      region: process.env.AWS_REGION!,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    email: {
      smtp: {
        host: process.env.SMTP_HOST!,
        port: parseInt(process.env.SMTP_PORT!),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASSWORD!,
        },
      },
      config: {
        from: process.env.EMAIL_FROM!,
        to: process.env.EMAIL_TO!,
      },
    },
    api: {
      geminiApiKey: process.env.GEMINI_API_KEY!,
      externalApiUrl: process.env.EXTERNAL_API_URL!,
    },
    server: {
      port: parseInt(process.env.PORT!) || 8080,
    },
  };
}
