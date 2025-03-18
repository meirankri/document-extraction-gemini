import * as Sentry from "@sentry/node";

// Initialisation de Sentry (à mettre au début du fichier)
Sentry.init({
  dsn: "https://8c9c24e8d70ccfbeb90e69e9f8033682@o4507430325649408.ingest.de.sentry.io/4507430332006480",
  environment: process.env.NODE_ENV || "development",
  integrations: (integrations) => {
    // Filtrer l'intégration HTTP qui cause le problème
    return integrations.filter((integration) => integration.name !== "Http");
  },
});

export const logger = ({
  message,
  context,
}: {
  message: string;
  context?: unknown;
}) => {
  return {
    info: () => console.info(message, context),
    error: () => {
      let contextStringified;
      try {
        contextStringified = context ? JSON.stringify(context) : null;
      } catch (error) {
        contextStringified = "Error stringifying context";
      }
      Sentry.setContext("error context", {
        context: contextStringified,
      });
      Sentry.captureException(new Error(message));
      process.env.NODE_ENV !== "production" && console.error(message, context);
    },
    warn: () => console.warn(message, context),
  };
};
