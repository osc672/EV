/**
 * Static OpenAPI 3.0 spec. Kept explicit (instead of relying on JSDoc
 * extraction) so documentation is available from both `src` and `dist`.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EV Rescue API',
    version: '1.0.0',
    description:
      'Emergency EV charging platform — discover verified local charging providers, book slots, and coordinate charging.',
  },
  servers: [
    { url: 'http://localhost:4000/api/v1', description: 'Local' },
    { url: 'https://api.evrescue.example.com/api/v1', description: 'Production' },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Providers' },
    { name: 'Bookings' },
    { name: 'Vehicles' },
    { name: 'Reviews' },
    { name: 'Favorites' },
    { name: 'Notifications' },
    { name: 'Search' },
    { name: 'Uploads' },
    { name: 'Payments' },
    { name: 'Admin' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['phone', 'fullName', 'password'],
        properties: {
          phone: { type: 'string', example: '+919876543210' },
          fullName: { type: 'string', example: 'Asha Patel' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: ['DRIVER', 'PROVIDER'], default: 'DRIVER' },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string' },
          password: { type: 'string' },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          accessTokenExpiresIn: { type: 'string', example: '15m' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          phone: { type: 'string' },
          email: { type: 'string', nullable: true },
          fullName: { type: 'string' },
          role: { type: 'string', enum: ['DRIVER', 'PROVIDER', 'ADMIN'] },
          avatarUrl: { type: 'string', nullable: true },
          isPhoneVerified: { type: 'boolean' },
          isActive: { type: 'boolean' },
        },
      },
      ProviderInput: {
        type: 'object',
        required: [
          'businessName',
          'providerType',
          'addressLine',
          'city',
          'state',
          'pincode',
          'latitude',
          'longitude',
          'connectorTypes',
        ],
        properties: {
          businessName: { type: 'string' },
          providerType: {
            type: 'string',
            enum: ['HOME', 'SHOP', 'OFFICE', 'HOTEL', 'REPAIR_SHOP', 'BUSINESS'],
          },
          description: { type: 'string' },
          phone: { type: 'string' },
          addressLine: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          pincode: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          openingTime: { type: 'string', example: '08:00' },
          closingTime: { type: 'string', example: '22:00' },
          pricePerKwh: { type: 'number' },
          connectorTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['TYPE_2', 'CCS2', 'CHADEMO', 'TYPE_1', 'GB_T', 'AC_3_PIN', 'OTHER'],
            },
          },
          maxPowerKw: { type: 'integer' },
          hasParking: { type: 'boolean' },
          hasRestroom: { type: 'boolean' },
          hasWifi: { type: 'boolean' },
          hasCctv: { type: 'boolean' },
          is24x7: { type: 'boolean' },
        },
      },
      BookingInput: {
        type: 'object',
        required: ['providerId', 'connectorType', 'scheduledAt'],
        properties: {
          providerId: { type: 'string', format: 'uuid' },
          vehicleId: { type: 'string', format: 'uuid' },
          connectorType: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' },
          notes: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { tags: ['Health'], summary: 'Health check', responses: { '200': { description: 'OK' } } },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a driver or provider',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
        },
        responses: {
          '201': { description: 'Created' },
          '409': { description: 'Conflict', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with phone and password',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: {
          '200': { description: 'Tokens', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: { tags: ['Auth'], summary: 'Rotate refresh token', responses: { '200': { description: 'New tokens' } } },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Revoke current refresh token', responses: { '200': { description: 'Logged out' } } },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'User', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
      },
    },
    '/auth/otp/request': {
      post: { tags: ['Auth'], summary: 'Request OTP', responses: { '200': { description: 'OTP sent' } } },
    },
    '/auth/otp/verify': {
      post: { tags: ['Auth'], summary: 'Verify OTP and issue tokens', responses: { '200': { description: 'Tokens' } } },
    },
    '/users/me': {
      get: { tags: ['Users'], summary: 'My profile', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
      patch: { tags: ['Users'], summary: 'Update my profile', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
    '/providers': {
      get: {
        tags: ['Providers'],
        summary: 'Browse approved providers',
        parameters: [
          { in: 'query', name: 'city', schema: { type: 'string' } },
          { in: 'query', name: 'connector', schema: { type: 'string' } },
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        ],
        responses: { '200': { description: 'List' } },
      },
      post: {
        tags: ['Providers'],
        summary: 'Create my provider profile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProviderInput' } } },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/providers/nearby': {
      get: {
        tags: ['Providers'],
        summary: 'Find verified providers near a coordinate (PostGIS)',
        parameters: [
          { in: 'query', name: 'lat', required: true, schema: { type: 'number' } },
          { in: 'query', name: 'lng', required: true, schema: { type: 'number' } },
          { in: 'query', name: 'radiusKm', schema: { type: 'number', default: 10 } },
          { in: 'query', name: 'connector', schema: { type: 'string' } },
          { in: 'query', name: 'availableOnly', schema: { type: 'boolean' } },
        ],
        responses: { '200': { description: 'Sorted by distance' } },
      },
    },
    '/providers/me': {
      get: { tags: ['Providers'], summary: 'My provider profile', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
      patch: { tags: ['Providers'], summary: 'Update my provider profile', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
    '/providers/{id}': {
      get: {
        tags: ['Providers'],
        summary: 'Provider detail',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/bookings': {
      post: {
        tags: ['Bookings'],
        summary: 'Request a charging slot',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingInput' } } },
        },
        responses: { '201': { description: 'Created' } },
      },
      get: {
        tags: ['Bookings'],
        summary: 'List my bookings',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'role', schema: { type: 'string', enum: ['driver', 'provider'] } },
          { in: 'query', name: 'status', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'List' } },
      },
    },
    '/bookings/{id}/status': {
      patch: {
        tags: ['Bookings'],
        summary: 'Advance or cancel a booking',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated' } },
      },
    },
    '/vehicles': {
      get: { tags: ['Vehicles'], summary: 'List my vehicles', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
      post: { tags: ['Vehicles'], summary: 'Add a vehicle', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } },
    },
    '/reviews': {
      post: { tags: ['Reviews'], summary: 'Review a completed booking', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } },
    },
    '/reviews/provider/{providerId}': {
      get: {
        tags: ['Reviews'],
        summary: 'Provider reviews',
        parameters: [{ in: 'path', name: 'providerId', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/favorites': {
      get: { tags: ['Favorites'], summary: 'My favorite providers', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
      post: { tags: ['Favorites'], summary: 'Add favorite', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } },
    },
    '/notifications': {
      get: { tags: ['Notifications'], summary: 'My notifications', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
    '/search/providers': {
      get: {
        tags: ['Search'],
        summary: 'Keyword search',
        parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/search/geocode': {
      get: {
        tags: ['Search'],
        summary: 'Forward geocode',
        parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/search/route': {
      get: { tags: ['Search'], summary: 'Driving route', responses: { '200': { description: 'OK' } } },
    },
    '/uploads/image': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload an image',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { '201': { description: 'Uploaded' } },
      },
    },
    '/payments/razorpay/order': {
      post: { tags: ['Payments'], summary: 'Create Razorpay order', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
    '/payments/razorpay/verify': {
      post: { tags: ['Payments'], summary: 'Verify payment', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
    '/admin/stats': {
      get: { tags: ['Admin'], summary: 'Platform KPIs', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
    '/admin/providers': {
      get: { tags: ['Admin'], summary: 'Provider applications', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
    '/admin/providers/{id}/review': {
      patch: {
        tags: ['Admin'],
        summary: 'Approve / reject / suspend provider',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/admin/users': {
      get: { tags: ['Admin'], summary: 'List users', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' } } },
    },
  },
};
