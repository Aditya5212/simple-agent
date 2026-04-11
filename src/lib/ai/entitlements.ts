export const entitlementsByUserType = {
  guest: {
    maxMessagesPerHour: 20,
  },
  regular: {
    maxMessagesPerHour: 200,
  },
} as const;
