function isLocalHost(hostname = '') {
    const safeHostname = String(hostname || '').trim().toLowerCase();
    return safeHostname === 'localhost' || safeHostname === '127.0.0.1' || safeHostname === '[::1]';
}

export function resolveRealtimeHttpBase() {
    if (typeof window === 'undefined') return '';
    const explicit = String(window.BNI_REALTIME_HTTP_URL || window.BNI_REALTIME_URL || '').trim();
    if (explicit) {
        return explicit.replace(/^ws/i, 'http').replace(/\/+$/, '');
    }

    if (isLocalHost(window.location.hostname)) {
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        return `${protocol}//localhost:8787`;
    }

    return '';
}

export function resolveRealtimeWsBase() {
    if (typeof window === 'undefined') return '';
    const explicit = String(window.BNI_REALTIME_WS_URL || window.BNI_REALTIME_URL || '').trim();
    if (explicit) {
        return explicit.replace(/^http/i, 'ws').replace(/\/+$/, '');
    }

    if (isLocalHost(window.location.hostname)) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//localhost:8787`;
    }

    return '';
}

export function canUseRealtimeTransport() {
    return Boolean(resolveRealtimeHttpBase() && resolveRealtimeWsBase());
}
