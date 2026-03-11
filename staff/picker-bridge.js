const DEFAULT_PICKER_FEATURES = 'width=1480,height=940,resizable=yes,scrollbars=no';

export function createPickerBridge(options = {}) {
    const targetOrigin = String(options.targetOrigin || window.location.origin || '').trim();
    const pickerUrl = String(options.pickerUrl || '../map/index.html?pickAlert=1').trim();
    const pickerName = String(options.pickerName || 'bni-alert-picker').trim() || 'bni-alert-picker';
    const onPayload = typeof options.onPayload === 'function' ? options.onPayload : () => {};
    const onOpened = typeof options.onOpened === 'function' ? options.onOpened : () => {};
    const onBlocked = typeof options.onBlocked === 'function' ? options.onBlocked : () => {};

    let pickerWindow = null;
    let bound = false;

    function open() {
        const picker = window.open(
            pickerUrl,
            pickerName,
            DEFAULT_PICKER_FEATURES
        );

        if (!picker) {
            onBlocked();
            return null;
        }

        pickerWindow = picker;
        try {
            picker.focus();
        } catch (e) {}

        onOpened();
        return picker;
    }

    function handleMessage(event) {
        if (targetOrigin && event.origin !== targetOrigin) return false;

        const data = event.data && typeof event.data === 'object' ? event.data : null;
        if (!data || data.type !== 'bni-alert-location') return false;

        pickerWindow = null;
        onPayload(data.payload);
        return true;
    }

    function bind() {
        if (bound) return;
        bound = true;
        window.addEventListener('message', handleMessage);
    }

    function unbind() {
        if (!bound) return;
        bound = false;
        window.removeEventListener('message', handleMessage);
    }

    return {
        open,
        bind,
        unbind,
        handleMessage,
        getPickerWindow() {
            return pickerWindow;
        }
    };
}
