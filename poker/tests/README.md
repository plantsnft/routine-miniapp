# Tests

This directory contains integration and unit tests for the poker mini-app.

## Running Tests Safely

### ⚠️ CRITICAL: Protect Production Data

**Never run tests against production Supabase!** Tests may create, modify, or delete data.

### Test Environment Setup

1. **Use a dedicated test Supabase project** (recommended):
   - Create a separate Supabase project for testing
   - Use test project URL and keys in your test environment

2. **Set environment variables**:
   ```bash
   # Required for test safety guards
   export NODE_ENV=test
   # OR
   export TEST_ENV=true
   
   # Test Supabase credentials (use test project, not production)
   export SUPABASE_URL=https://your-test-project.supabase.co
   export SUPABASE_ANON_KEY=your-test-anon-key
   
   # Optional: API URL for integration tests
   export API_URL=http://localhost:3000
   export TEST_AUTH_TOKEN=your-test-jwt-token
   export TEST_AUTH_TOKEN_UNAUTHORIZED=another-test-token
   ```

3. **Run tests**:
   ```bash
   npm test
   # OR
   npm run test:integration
   ```

### Safety Guards

Tests include safeguards that will fail fast if:
- `NODE_ENV !== 'test'` (unless `TEST_ENV=true` is explicitly set)
- Supabase URL appears to be production (contains `supabase.co` but not `test`/`dev`/`localhost`) and test environment is not set

These guards can be bypassed by setting `TEST_ENV=true`, but you should only do this when using a test Supabase project. The guard will still warn if a production-like URL is detected even in test mode.

### Test Structure

- **Integration tests** (`tests/integration/`): Make HTTP requests to API endpoints
  - These tests use the actual API routes, which connect to Supabase via environment variables
  - Ensure test Supabase credentials are set before running

- **Unit tests** (`tests/unit/`): Test individual functions in isolation
  - Can use mocked dependencies
  - Safer to run as they don't hit external services

### Credentials API Tests

The `credentials-api.test.ts` file tests the ClubGG password unlock flow:
- Tests authorization checks (locked vs unlocked responses)
- Verifies response shapes match API contract
- Ensures cache headers are present

**To run credentials tests specifically:**
```bash
npm test tests/integration/credentials-api.test.ts
```

### Local Development

For local development, you can:
1. Use local Supabase instance (`supabase start`)
2. Point tests to local instance: `SUPABASE_URL=http://localhost:54321`
3. Use test database with isolated schema

### CI/CD

In CI environments, tests should:
- Use dedicated test Supabase project
- Set `NODE_ENV=test` or `TEST_ENV=true` (required for safety guards)
- Ensure test Supabase credentials are configured

