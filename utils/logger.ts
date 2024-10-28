
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
      console.error(message, context);
    },
    warn: () => console.warn(message, context),
  };
};
