# Resilience Library

Standalone utilities for building resilient API calls across the newsletter system. Implements Circuit Breaker pattern and Retry with Exponential Backoff.

## Overview

This library provides production-ready resilience patterns to prevent cascading failures and handle transient errors gracefully.

**Key Features:**
- Circuit Breaker with 3 states (CLOSED, OPEN, HALF_OPEN)
- Exponential backoff retry with jitter
- Configurable failure thresholds and timeouts
- Error filtering (retry only specific errors)
- State change callbacks for monitoring
- Comprehensive test coverage (40+ tests)

## Circuit Breaker Pattern

### What is a Circuit Breaker?

A circuit breaker prevents cascading failures by "opening" when a service is down, failing fast instead of repeatedly trying broken services.

**Three States:**

1. **CLOSED** (normal operation):
   - All requests pass through
   - Track failures
   - If failures >= threshold → transition to OPEN

2. **OPEN** (circuit tripped):
   - All requests fail immediately (fail fast)
   - Start recovery timer
   - After timeout → transition to HALF_OPEN

3. **HALF_OPEN** (testing recovery):
   - Allow limited test requests
   - If succeeds >= threshold → transition to CLOSED
   - If fails → back to OPEN

### Basic Usage

```typescript
import { CircuitBreaker, createCircuitBreaker } from '@/lib/resilience';

// Create circuit breaker
const redditCircuit = createCircuitBreaker('reddit-api', {
  failureThreshold: 3,      // Open after 3 failures
  successThreshold: 2,      // Close after 2 successes in half-open
  timeout: 30000,           // 30 seconds before retry
});

// Use circuit breaker
async function fetchReddit() {
  return redditCircuit.execute(async () => {
    const response = await fetch('https://reddit.com/r/Entrepreneur/top.json');
    return response.json();
  });
}

// Handle circuit open errors
try {
  const data = await fetchReddit();
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('Circuit is open, try again later');
  }
}
```

### Advanced Configuration

```typescript
const circuit = new CircuitBreaker({
  name: 'my-api',
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,

  // Callback on state change
  onStateChange: (state, metadata) => {
    console.log(`Circuit ${state}`, metadata);
    // Log to monitoring system
  },

  // Only count specific errors as failures
  isErrorRetryable: (error) => {
    // Don't count 404s as failures
    return !error.message.includes('404');
  },
});
```

### Monitoring Circuit Status

```typescript
// Check current state
const state = circuit.getState(); // 'closed' | 'open' | 'half_open'

// Check availability
const available = circuit.isAvailable();

// Get detailed metadata
const metadata = circuit.getMetadata();
console.log({
  state: metadata.state,
  totalFailures: metadata.totalFailures,
  totalSuccesses: metadata.totalSuccesses,
  totalRejections: metadata.totalRejections,
  lastFailureTime: metadata.lastFailureTime,
});
```

### Manual Control

```typescript
// Reset circuit (use with caution)
circuit.reset();

// Force circuit open (maintenance mode)
circuit.forceOpen(3600000); // 1 hour

// Force circuit closed (when you know service is healthy)
circuit.forceClose();
```

## Retry with Exponential Backoff

### What is Exponential Backoff?

Exponential backoff progressively increases delay between retries to avoid overwhelming a recovering service.

**Example delays:**
- Attempt 1: 1s
- Attempt 2: 2s
- Attempt 3: 4s
- Attempt 4: 8s

**Jitter** adds randomness to prevent "thundering herd" problem.

### Basic Usage

```typescript
import { retryWithBackoff, RetryPresets } from '@/lib/resilience';

async function fetchAPI() {
  return retryWithBackoff(
    async () => {
      const response = await fetch('https://api.example.com/data');
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return response.json();
    },
    RetryPresets.STANDARD // 3 attempts, 1s-30s delays
  );
}
```

### Retry Presets

```typescript
// Fast retry (3 attempts, 500ms-5s)
RetryPresets.FAST

// Standard retry (3 attempts, 1s-30s)
RetryPresets.STANDARD

// Slow retry (5 attempts, 2s-60s)
RetryPresets.SLOW

// Aggressive retry (7 attempts, 1s-120s)
RetryPresets.AGGRESSIVE
```

### Custom Configuration

```typescript
const result = await retryWithBackoff(
  () => callAPI(),
  {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    name: 'my-api-call',

    // Only retry specific errors
    retryableErrors: ['ECONNRESET', '500', '503', 'timeout'],

    // Or use custom logic
    isRetryable: (error) => {
      return error.message.includes('rate_limit');
    },

    // Callback on each retry
    onRetry: (attempt, error, delay) => {
      console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
    },
  }
);
```

### Error Filtering

```typescript
// Only retry network errors, not validation errors
const result = await retryWithBackoff(
  () => submitForm(),
  {
    ...RetryPresets.STANDARD,
    isRetryable: (error) => {
      // Don't retry validation errors
      if (error.message.includes('validation')) return false;
      if (error.message.includes('invalid')) return false;

      // Retry network and server errors
      return true;
    },
  }
);
```

## Combining Circuit Breaker + Retry

### Pattern 1: Circuit Outside Retry

Circuit breaker protects the service, retry handles transient errors.

```typescript
import {
  createCircuitBreaker,
  retryWithBackoff,
  RetryPresets
} from '@/lib/resilience';

const circuit = createCircuitBreaker('reddit-api', {
  failureThreshold: 3,
  timeout: 30000,
});

async function fetchReddit() {
  return circuit.execute(async () => {
    // Retry inside circuit
    return retryWithBackoff(
      () => fetch('https://reddit.com/api/data').then(r => r.json()),
      RetryPresets.STANDARD
    );
  });
}
```

### Pattern 2: Using Helper Function

```typescript
import { retryWithCircuitBreaker } from '@/lib/resilience';

const result = await retryWithCircuitBreaker(
  () => callAPI(),
  RetryPresets.STANDARD,
  myCircuitBreaker
);
```

## Integration with Existing Sources

### Reddit API Example

```typescript
import { createCircuitBreaker, retryWithBackoff, RetryPresets } from '@/lib/resilience';

class RedditSource {
  private circuit = createCircuitBreaker('reddit', {
    failureThreshold: 3,
    timeout: 30000,
    onStateChange: (state) => {
      console.log(`[Reddit] Circuit ${state}`);
    },
  });

  async fetchArticles(subreddit: string) {
    return this.circuit.execute(async () => {
      return retryWithBackoff(
        async () => {
          const response = await fetch(
            `https://reddit.com/r/${subreddit}/top.json`
          );
          if (!response.ok) throw new Error(`Reddit error: ${response.status}`);
          return response.json();
        },
        {
          ...RetryPresets.STANDARD,
          retryableErrors: ['500', '502', '503', 'ECONNRESET'],
        }
      );
    });
  }
}
```

### Hacker News API Example

```typescript
class HackerNewsSource {
  private circuit = createCircuitBreaker('hackernews', {
    failureThreshold: 5, // More lenient
    timeout: 60000,
  });

  async fetchTopStories() {
    return this.circuit.execute(async () => {
      return retryWithBackoff(
        async () => {
          const response = await fetch(
            'https://hacker-news.firebaseio.com/v0/topstories.json'
          );
          return response.json();
        },
        RetryPresets.FAST
      );
    });
  }
}
```

### OpenAI/Anthropic AI API Example

```typescript
class AISource {
  private circuit = createCircuitBreaker('ai-api', {
    failureThreshold: 3,
    timeout: 60000,
    // Only count retryable errors
    isErrorRetryable: (error) => {
      return (
        error.message.includes('rate_limit') ||
        error.message.includes('timeout')
      );
    },
  });

  async summarize(text: string) {
    return this.circuit.execute(async () => {
      return retryWithBackoff(
        async () => {
          // AI API call
          const response = await callClaudeAPI(text);
          return response;
        },
        {
          maxAttempts: 3,
          initialDelay: 2000, // Slower for AI
          maxDelay: 60000,
          backoffMultiplier: 2,
          jitter: true,
          retryableErrors: ['rate_limit', '429', '503'],
        }
      );
    });
  }
}
```

### Email API (Resend) Example

```typescript
class EmailSource {
  private circuit = createCircuitBreaker('email-api', {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
  });

  async sendEmail(to: string, subject: string, html: string) {
    return this.circuit.execute(async () => {
      return retryWithBackoff(
        async () => {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({ from: 'no-reply@example.com', to, subject, html }),
          });

          if (!response.ok) {
            throw new Error(`Email error: ${response.status}`);
          }

          return response.json();
        },
        {
          ...RetryPresets.STANDARD,
          isRetryable: (error) => {
            // Don't retry validation errors
            return !error.message.includes('validation');
          },
        }
      );
    });
  }
}
```

## Production Best Practices

### 1. Configure Per Service

Different services need different configurations:

```typescript
// Fast, reliable API
const hnCircuit = createCircuitBreaker('hn', {
  failureThreshold: 5,
  timeout: 60000,
});

// Slow, unreliable API
const rssCircuit = createCircuitBreaker('rss', {
  failureThreshold: 2,
  timeout: 30000,
});

// Expensive API (AI)
const aiCircuit = createCircuitBreaker('ai', {
  failureThreshold: 3,
  timeout: 120000,
  isErrorRetryable: (error) => {
    // Only count server errors, not token limits
    return error.message.includes('500');
  },
});
```

### 2. Monitor Circuit State

```typescript
const circuit = createCircuitBreaker('api', {
  failureThreshold: 3,
  timeout: 30000,
  onStateChange: (state, metadata) => {
    // Log to monitoring system
    logger.info('Circuit state changed', {
      circuit: 'api',
      state,
      failures: metadata.totalFailures,
      successes: metadata.totalSuccesses,
    });

    // Alert on open
    if (state === CircuitState.OPEN) {
      sendAlert('Circuit breaker opened for API');
    }
  },
});
```

### 3. Graceful Degradation

```typescript
async function fetchMultipleSources() {
  const results = await Promise.allSettled([
    redditCircuit.execute(() => fetchReddit()),
    hnCircuit.execute(() => fetchHN()),
    rssCircuit.execute(() => fetchRSS()),
  ]);

  // Continue with whatever succeeded
  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  if (articles.length === 0) {
    throw new Error('All sources failed');
  }

  return articles;
}
```

### 4. Maintenance Mode

```typescript
class API {
  private circuit = createCircuitBreaker('api', {
    failureThreshold: 3,
    timeout: 30000,
  });

  enableMaintenanceMode(hours: number = 1) {
    this.circuit.forceOpen(hours * 3600000);
    console.log(`Maintenance mode enabled for ${hours} hours`);
  }

  disableMaintenanceMode() {
    this.circuit.forceClose();
    console.log('Maintenance mode disabled');
  }
}
```

### 5. Metrics Collection

```typescript
class MetricsCollector {
  private circuits = new Map<string, CircuitBreaker>();

  register(name: string, circuit: CircuitBreaker) {
    this.circuits.set(name, circuit);
  }

  getMetrics() {
    const metrics = {};

    for (const [name, circuit] of this.circuits) {
      const metadata = circuit.getMetadata();
      const total = metadata.totalSuccesses +
                    metadata.totalFailures +
                    metadata.totalRejections;

      metrics[name] = {
        state: metadata.state,
        successRate: total > 0 ? metadata.totalSuccesses / total : 0,
        failureRate: total > 0 ? metadata.totalFailures / total : 0,
        rejectionRate: total > 0 ? metadata.totalRejections / total : 0,
      };
    }

    return metrics;
  }
}
```

## Testing

### Run Tests

```bash
npm test src/lib/resilience/__tests__
```

### Test Coverage

- Circuit Breaker: 25+ test cases
- Retry: 20+ test cases
- Integration: 10+ examples

### Example Test

```typescript
import { createCircuitBreaker, CircuitState } from '@/lib/resilience';

test('circuit opens after failure threshold', async () => {
  const circuit = createCircuitBreaker('test', {
    failureThreshold: 3,
    timeout: 30000,
  });

  // Fail 3 times
  for (let i = 0; i < 3; i++) {
    await expect(
      circuit.execute(() => Promise.reject(new Error('Failed')))
    ).rejects.toThrow();
  }

  expect(circuit.getState()).toBe(CircuitState.OPEN);
});
```

## Why This Matters

Circuit breakers prevent cascading failures:

1. **If Reddit is down**, don't keep hammering it (fail fast)
2. **If OpenAI is rate limited**, back off and recover gracefully
3. **If Resend is slow**, circuit opens to prevent timeout pile-up

This is critical for production resilience.

## API Reference

### CircuitBreaker

```typescript
class CircuitBreaker {
  constructor(config: CircuitBreakerConfig)

  execute<T>(fn: () => Promise<T>): Promise<T>
  getState(): CircuitState
  getMetadata(): CircuitMetadata
  isAvailable(): boolean
  reset(): void
  forceOpen(timeoutMs?: number): void
  forceClose(): void
}
```

### retryWithBackoff

```typescript
function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T>
```

### Exports

```typescript
export {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerError,
  createCircuitBreaker,
  retryWithBackoff,
  RetryError,
  RetryPresets,
  createRetryFunction,
  retryWithTimeout,
  retryWithCircuitBreaker,
  sleep,
}
```

## Additional Resources

- [Netflix Hystrix](https://github.com/Netflix/Hystrix/wiki) - Original circuit breaker implementation
- [Martin Fowler - CircuitBreaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [AWS Architecture Blog - Exponential Backoff](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

## License

MIT
