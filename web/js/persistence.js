(function attachPersistence(global) {
  const DATABASE_NAME = "stopmission";
  const STORE_NAME = "sessions";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "sessionKey" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, callback) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      transaction.oncomplete = () => {
        database.close();
      };
      transaction.onerror = () => {
        reject(transaction.error);
        database.close();
      };

      callback(store, resolve, reject);
    });
  }

  function getSession(sessionKey) {
    return withStore("readonly", (store, resolve, reject) => {
      const request = store.get(sessionKey);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  function putSession(session) {
    return withStore("readwrite", (store, resolve, reject) => {
      const request = store.put(session);
      request.onsuccess = () => resolve(session);
      request.onerror = () => reject(request.error);
    });
  }

  function clearSession(sessionKey) {
    return withStore("readwrite", (store, resolve, reject) => {
      const request = store.delete(sessionKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function initializeSession(session) {
    const existing = await getSession(session.sessionKey);
    return existing ?? putSession({ ...session, trials: [], completed: false });
  }

  async function saveTrial(sessionKey, trialData) {
    const session = await getSession(sessionKey);

    if (!session) {
      throw new Error(`No IndexedDB session found for ${sessionKey}.`);
    }

    const trials = session.trials.slice();
    const existingIndex = trials.findIndex((entry) => entry.trial === trialData.trial);
    const existingTrial = existingIndex >= 0 ? trials[existingIndex] : null;
    const nextTrial = {
      ...trialData,
      server_saved: existingTrial?.server_saved ?? false
    };

    if (existingIndex >= 0) {
      trials[existingIndex] = nextTrial;
    } else {
      trials.push(nextTrial);
    }

    trials.sort((a, b) => a.trial - b.trial);

    return putSession({
      ...session,
      trials,
      updatedAt: new Date().toISOString()
    });
  }

  async function markSessionComplete(sessionKey) {
    const session = await getSession(sessionKey);

    if (!session) {
      return null;
    }

    return putSession({
      ...session,
      completed: true,
      completedAt: new Date().toISOString()
    });
  }

  async function markTrialServerSaved(sessionKey, trialNumber) {
    const session = await getSession(sessionKey);

    if (!session) {
      return null;
    }

    const trials = session.trials.map((trial) =>
      trial.trial === trialNumber ? { ...trial, server_saved: true } : trial
    );

    return putSession({
      ...session,
      trials,
      updatedAt: new Date().toISOString()
    });
  }

  async function saveKeyMapping(sessionKey, keyMapping) {
    const session = await getSession(sessionKey);

    if (!session) {
      throw new Error(`No IndexedDB session found for ${sessionKey}.`);
    }

    return putSession({
      ...session,
      keyMapping,
      updatedAt: new Date().toISOString()
    });
  }

  async function postRecord(record) {
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      keepalive: true
    });

    if (!response.ok) {
      throw new Error(`Failed to save data to local server (${response.status}).`);
    }

    return response.json();
  }

  async function postKeyMapping(record) {
    const response = await fetch("/api/keymap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      keepalive: true
    });

    if (!response.ok) {
      throw new Error(`Failed to save key mapping to local server (${response.status}).`);
    }

    return response.json();
  }

  global.stopMissionPersistence = {
    clearSession,
    getSession,
    initializeSession,
    markTrialServerSaved,
    markSessionComplete,
    postKeyMapping,
    postRecord,
    saveKeyMapping,
    saveTrial
  };
})(window);
