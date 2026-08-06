import posthog from 'posthog-js';

const isAnalyticsEnabled = (): boolean => {
  return typeof import.meta.env !== 'undefined' && 
    !!import.meta.env.VITE_POSTHOG_KEY && 
    import.meta.env.PROD;
};

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (isAnalyticsEnabled()) {
    try {
      posthog.capture(eventName, properties);
    } catch (err) {
      console.error("Failed to capture posthog event:", err);
    }
  }
};
