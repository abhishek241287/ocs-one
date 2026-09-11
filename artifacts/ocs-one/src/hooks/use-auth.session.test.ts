import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  AUTH_KEY,
  DEALER_SESSION_CHANGED_REASON,
  isDealerSessionExpiredError,
  recoverDealerSession,
} from "./dealer-session";

describe("dealer forced re-login", () => {
  it("clears cached auth and routes to sign-in for the server session-expired response", () => {
    const authUpdates: unknown[] = [];
    const destinations: string[] = [];
    const queryClient = {
      setQueryData: (key: readonly unknown[], value: unknown) => {
        assert.deepEqual(key, AUTH_KEY);
        authUpdates.push(value);
      },
    };

    const handled = recoverDealerSession(
      queryClient,
      (path) => destinations.push(path),
      {
        status: 401,
        data: { error: "Session is no longer valid. Please log in again." },
      },
    );

    assert.equal(handled, true);
    assert.deepEqual(authUpdates, [null]);
    assert.deepEqual(destinations, [
      `/login?reason=${DEALER_SESSION_CHANGED_REASON}`,
    ]);
  });

  it("does not redirect or clear auth for a different 401", () => {
    const queryClient = {
      setQueryData: () => {
        throw new Error("unexpected auth cache mutation");
      },
    };

    assert.equal(
      isDealerSessionExpiredError({
        status: 401,
        data: { error: "Authentication required" },
      }),
      false,
    );
    assert.equal(
      recoverDealerSession(queryClient, () => {
        throw new Error("unexpected redirect");
      }, {
        status: 403,
        data: { error: "Access denied" },
      }),
      false,
    );
  });
});