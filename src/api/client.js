async function request(path, init = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.detail ?? `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function fetchServerState() {
  return request("/api/state");
}

export function setServerMode(editMode) {
  return request("/api/mode", {
    method: "POST",
    body: JSON.stringify({ edit_mode: editMode }),
  });
}

export function syncServerLayout(payload) {
  return request("/api/layout/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function setActiveIOZone(side) {
  return request("/api/io-zone", {
    method: "POST",
    body: JSON.stringify({ side }),
  });
}

export function setActiveCrane(side) {
  return request("/api/crane/select", {
    method: "POST",
    body: JSON.stringify({ side }),
  });
}

export function setStackCapacity(capacity) {
  return request("/api/stack-capacity", {
    method: "POST",
    body: JSON.stringify({ capacity }),
  });
}

export function moveCrane(direction) {
  return request("/api/crane/move", {
    method: "POST",
    body: JSON.stringify({ direction }),
  });
}

export function rackExchange() {
  return request("/api/crane/rack-exchange", {
    method: "POST",
  });
}

export function ioExchange() {
  return request("/api/crane/io-exchange", {
    method: "POST",
  });
}

export function launchFromIO() {
  return request("/api/io/launch", {
    method: "POST",
  });
}

export function moveFieldObject(direction) {
  return request("/api/field/move", {
    method: "POST",
    body: JSON.stringify({ direction }),
  });
}
