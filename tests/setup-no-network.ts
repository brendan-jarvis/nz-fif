// CI must never call Yahoo or any other network service. Any test that
// forgets to inject a fake fetch fails loudly here.
globalThis.fetch = (() => {
  throw new Error('Network access is forbidden in tests (inject a fake fetch).');
}) as typeof fetch;
