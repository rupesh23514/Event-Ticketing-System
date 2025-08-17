// Payment Configuration
// This file manages payment gateway settings and configurations

export const paymentConfig = {
  // Default payment gateway
  defaultGateway: process.env.DEFAULT_PAYMENT_GATEWAY || 'stripe',
  
  // Stripe Configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_your_stripe_publishable_key',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_your_webhook_secret',
    currency: 'usd',
    mode: process.env.STRIPE_MODE || 'test' // 'test' or 'live'
  },
  
  // Razorpay Configuration
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_your_razorpay_key_id',
    keySecret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_key_secret',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret',
    currency: 'INR',
    mode: process.env.RAZORPAY_MODE || 'test' // 'test' or 'live'
  },
  
  // PayPal Configuration
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || 'your_paypal_client_id',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || 'your_paypal_client_secret',
    mode: process.env.PAYPAL_MODE || 'sandbox' // 'sandbox' or 'live'
  },
  
  // General Payment Settings
  general: {
    // Supported currencies
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'],
    
    // Default currency
    defaultCurrency: 'USD',
    
    // Payment timeout (in minutes)
    paymentTimeout: 30,
    
    // Maximum payment amount
    maxAmount: 10000,
    
    // Minimum payment amount
    minAmount: 0.01,
    
    // Auto-refund settings
    autoRefund: {
      enabled: false,
      delay: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    },
    
    // Retry settings
    retry: {
      maxAttempts: 3,
      delay: 5 * 60 * 1000 // 5 minutes in milliseconds
    }
  },
  
  // Webhook Configuration
  webhooks: {
    // Webhook timeout (in seconds)
    timeout: 30,
    
    // Maximum webhook payload size (in bytes)
    maxPayloadSize: 1024 * 1024, // 1MB
    
    // Webhook retry settings
    retry: {
      maxAttempts: 5,
      delay: 60 * 1000 // 1 minute in milliseconds
    }
  },
  
  // Security Settings
  security: {
    // Require webhook signature verification
    requireWebhookSignature: true,
    
    // Allowed webhook IPs (for additional security)
    allowedWebhookIPs: process.env.ALLOWED_WEBHOOK_IPS ? 
      process.env.ALLOWED_WEBHOOK_IPS.split(',') : [],
    
    // Rate limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  },
  
  // Logging Configuration
  logging: {
    // Log payment attempts
    logPaymentAttempts: true,
    
    // Log webhook events
    logWebhookEvents: true,
    
    // Log refunds
    logRefunds: true,
    
    // Log level
    level: process.env.PAYMENT_LOG_LEVEL || 'info'
  }
};

// Payment Gateway Priority (order of preference)
export const gatewayPriority = [
  'stripe',
  'razorpay', 
  'paypal'
];

// Currency-specific gateway preferences
export const currencyGatewayMap = {
  'USD': ['stripe', 'paypal'],
  'EUR': ['stripe', 'paypal'],
  'GBP': ['stripe', 'paypal'],
  'INR': ['razorpay', 'stripe'],
  'CAD': ['stripe', 'paypal'],
  'AUD': ['stripe', 'paypal']
};

// Get the best payment gateway for a given currency
export const getBestGatewayForCurrency = (currency) => {
  const preferredGateways = currencyGatewayMap[currency.toUpperCase()] || gatewayPriority;
  
  for (const gateway of preferredGateways) {
    if (paymentConfig[gateway] && paymentConfig[gateway].keyId) {
      return gateway;
    }
  }
  
  // Fallback to default gateway
  return paymentConfig.defaultGateway;
};

// Validate payment configuration
export const validatePaymentConfig = () => {
  const errors = [];
  
  // Check if at least one payment gateway is configured
  const hasStripe = paymentConfig.stripe.secretKey && paymentConfig.stripe.secretKey !== 'sk_test_your_stripe_secret_key';
  const hasRazorpay = paymentConfig.razorpay.keyId && paymentConfig.razorpay.keyId !== 'rzp_test_your_razorpay_key_id';
  const hasPayPal = paymentConfig.paypal.clientId && paymentConfig.paypal.clientId !== 'your_paypal_client_id';
  
  if (!hasStripe && !hasRazorpay && !hasPayPal) {
    errors.push('At least one payment gateway must be configured');
  }
  
  // Validate Stripe configuration
  if (hasStripe) {
    if (!paymentConfig.stripe.publishableKey || paymentConfig.stripe.publishableKey === 'pk_test_your_stripe_publishable_key') {
      errors.push('Stripe publishable key is required');
    }
  }
  
  // Validate Razorpay configuration
  if (hasRazorpay) {
    if (!paymentConfig.razorpay.keySecret || paymentConfig.razorpay.keySecret === 'your_razorpay_key_secret') {
      errors.push('Razorpay key secret is required');
    }
  }
  
  // Validate PayPal configuration
  if (hasPayPal) {
    if (!paymentConfig.paypal.clientSecret || paymentConfig.paypal.clientSecret === 'your_paypal_client_secret') {
      errors.push('PayPal client secret is required');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Get payment gateway status
export const getGatewayStatus = () => {
  const status = {};
  
  // Stripe status
  status.stripe = {
    enabled: !!(paymentConfig.stripe.secretKey && paymentConfig.stripe.secretKey !== 'sk_test_your_stripe_secret_key'),
    mode: paymentConfig.stripe.mode,
    currency: paymentConfig.stripe.currency
  };
  
  // Razorpay status
  status.razorpay = {
    enabled: !!(paymentConfig.razorpay.keyId && paymentConfig.razorpay.keyId !== 'rzp_test_your_razorpay_key_id'),
    mode: paymentConfig.razorpay.mode,
    currency: paymentConfig.razorpay.currency
  };
  
  // PayPal status
  status.paypal = {
    enabled: !!(paymentConfig.paypal.clientId && paymentConfig.paypal.clientId !== 'your_paypal_client_id'),
    mode: paymentConfig.paypal.mode,
    currency: 'USD' // PayPal supports multiple currencies but USD is primary
  };
  
  return status;
};
