// ============================================================
// DEFAULT CUSTOMER NAMES (Rows 1 to 50)
// ============================================================
const DEFAULT_NAMES = [
    "Rassel", "Cess", "Ed", "Risa", "Rakel", "Lina", 
    "7/11", "Leah", "Jeny", 
    "Sweet", "Lany", "Jean", "Ling²", "", "", "Flor",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
];

// ============================================================
// PWA INSTALL PROMPT HANDLER
// ============================================================

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'block';
    }
});

function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
        }
        deferredPrompt = null;
        const btn = document.getElementById('installBtn');
        if (btn) {
            btn.style.display = 'none';
        }
    });
}

// ============================================================
// SERVICE WORKER
// ============================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=1', {
            scope: './'
        })
        .then(reg => {
            console.log('Service Worker Registered!', reg);
        })
        .catch(err => {
            console.log('Service Worker Registration Failed:', err);
        });
    });
}

// ============================================================
// GLOBAL STATE
// ============================================================

let activeRow = 1;

let tapCount = 0;
let tapTimer = null;
let isLocked = true;

let priceTapCount = 0;
let priceTapTimer = null;
let isPriceLocked = true;

let currentSessionDate = "";
let currentSessionName = "";

let modalMode = "OPEN";

let inactivityTimer = null;
let isEditingActive = false;

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

// PREVIEW STATE
let isPreviewMode = false;
let previewDateKey = null;
let previewBackup = null;

// ROW UTANG MODE TRACKER (Para sa 5-tap sa Coll'n)
let rowUtangMode = {};
let rowTapCounts = {};
let rowTapTimers = {};

// PRINT COUNTER TRACKER
let printCounters = {};

// ============================================================
// VIEW SWITCHER & PRINT AUDIT LOG SYSTEM (50 ROWS)
// ============================================================
let currentTableViewMode = "CUSTOMERS"; // "CUSTOMERS" or "PRINT_HISTORY"
let longPressTimer = null;

window.addEventListener('DOMContentLoaded', () => {
    const viewToggleBtn = document.getElementById("viewToggleBtn");

    if (viewToggleBtn) {
        viewToggleBtn.addEventListener("touchstart", (e) => {
            e.preventDefault();
            startLongPressToggle();
        });
        viewToggleBtn.addEventListener("touchend", cancelLongPressToggle);

        viewToggleBtn.addEventListener("mousedown", startLongPressToggle);
        viewToggleBtn.addEventListener("mouseup", cancelLongPressToggle);
        viewToggleBtn.addEventListener("mouseleave", cancelLongPressToggle);
    }

    loadLedger();
});

function startLongPressToggle() {
    const viewToggleBtn = document.getElementById("viewToggleBtn");
    if (!viewToggleBtn) return;
    viewToggleBtn.style.opacity = "0.6";
    viewToggleBtn.innerText = "⏳ HOLDING... (3s)";

    longPressTimer = setTimeout(() => {
        toggleTableViewMode();
    }, 3000);
}

function cancelLongPressToggle() {
    clearTimeout(longPressTimer);
    updateToggleBtnUI();
}

function toggleTableViewMode() {
    if (currentTableViewMode === "CUSTOMERS") {
        currentTableViewMode = "PRINT_HISTORY";
        renderPrintHistoryToTable();
    } else {
        currentTableViewMode = "CUSTOMERS";
        restoreCustomersToTable();
    }
    updateToggleBtnUI();
}

function updateToggleBtnUI() {
    const viewToggleBtn = document.getElementById("viewToggleBtn");
    if (!viewToggleBtn) return;
    viewToggleBtn.style.opacity = "1";
    if (currentTableViewMode === "CUSTOMERS") {
        viewToggleBtn.innerText = "📋 VIEW: CUSTOMERS TABLE (Hold 3s to Switch)";
        viewToggleBtn.style.backgroundColor = "#2563eb";
    } else {
        viewToggleBtn.innerText = "🖨️ VIEW: PRINT HISTORY LOG (Hold 3s to Switch)";
        viewToggleBtn.style.backgroundColor = "#d97706";
    }
}

function recordPrintLog(rowNum, customerName, dry, fresh, cab, bo, bal, billing, payment, utang, copyCount) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    const sessionDate = currentSessionDate || todayDate;
    const logKey = `miki_print_log_${sessionDate}`;

    let logs = JSON.parse(localStorage.getItem(logKey) || "[]");
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    const logEntry = {
        printId: logs.length + 1,
        time: timeStr,
        rowNum: rowNum,
        customerName: customerName,
        dry: dry,
        fresh: fresh,
        cab: cab,
        bo: bo,
        bal: bal,
        billing: billing,
        payment: payment,
        utang: utang,
        copyCount: copyCount
    };

    logs.push(logEntry);
    localStorage.setItem(logKey, JSON.stringify(logs));

    if (currentTableViewMode === "PRINT_HISTORY") {
        renderPrintHistoryToTable();
    }
}

function renderPrintHistoryToTable() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    const sessionDate = currentSessionDate || todayDate;
    const logKey = `miki_print_log_${sessionDate}`;
    const logs = JSON.parse(localStorage.getItem(logKey) || "[]");

    setEncodingEditable(false);

    for (let i = 1; i <= 50; i++) {
        const log = logs[i - 1];

        const nameEl = document.getElementById(`ledgerName_${i}`);
        if (!nameEl) continue;

        if (log) {
            nameEl.value = `#${log.printId} ${log.customerName} (${log.time})`;
            document.getElementById(`ledgerDry_${i}`).value = log.dry || "";
            document.getElementById(`ledgerFresh_${i}`).value = log.fresh || "";
            document.getElementById(`ledgerCab_${i}`).value = log.cab || "";
            document.getElementById(`ledgerBo_${i}`).value = log.bo || "";
            document.getElementById(`ledgerBal_${i}`).value = log.bal || "";
            document.getElementById(`ledgerBilling_${i}`).value = formatMoney(log.billing);
            document.getElementById(`ledgerPay_${i}`).value = formatMoney(log.payment);
            document.getElementById(`ledgerRem_${i}`).value = formatMoney(log.utang);
        } else {
            nameEl.value = `--- [Empty Log Slot ${i}] ---`;
            document.getElementById(`ledgerDry_${i}`).value = "";
            document.getElementById(`ledgerFresh_${i}`).value = "";
            document.getElementById(`ledgerCab_${i}`).value = "";
            document.getElementById(`ledgerBo_${i}`).value = "";
            document.getElementById(`ledgerBal_${i}`).value = "";
            document.getElementById(`ledgerBilling_${i}`).value = "";
            document.getElementById(`ledgerPay_${i}`).value = "";
            document.getElementById(`ledgerRem_${i}`).value = "";
        }
    }
}

function restoreCustomersToTable() {
    const activeDraft = JSON.parse(localStorage.getItem("miki_ledger_data"));
    if (activeDraft) {
        restoreLedgerData(activeDraft);
    } else {
        applyDefaultNamesIfEmpty();
    }
    setEncodingEditable(true);
}

// ============================================================
// SESSION DATE DISPLAY
// ============================================================

function updateSessionDateDisplay() {
    const dateEl = document.getElementById("displayFileDate");
    const nameEl = document.getElementById("displayFileName");
    const dayEl = document.getElementById("displayFileDay");
    const watermarkEl = document.getElementById("customerDayWatermark");

    if (!dateEl || !nameEl) return;

    if (!currentSessionDate) {
        dateEl.textContent = "--";
        nameEl.textContent = currentSessionName || "--";
        if (dayEl) dayEl.textContent = "---";
        if (watermarkEl) watermarkEl.textContent = "--";
        return;
    }

    const date = new Date(currentSessionDate + "T00:00:00");

    if (isNaN(date.getTime())) {
        dateEl.textContent = currentSessionDate;
        nameEl.textContent = currentSessionName || "--";
        if (dayEl) dayEl.textContent = "---";
        if (watermarkEl) watermarkEl.textContent = "--";
        return;
    }

    const dayNumber = String(date.getDate()).padStart(2, "0");
    const weekdayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    const formattedDate = monthNames[date.getMonth()] + " " + dayNumber + ", " + date.getFullYear();

    dateEl.textContent = formattedDate;
    nameEl.textContent = currentSessionName || "--";
    if (dayEl) dayEl.textContent = weekdayNames[date.getDay()];
    if (watermarkEl) watermarkEl.textContent = dayNumber;
}

// ============================================================
// INACTIVITY
// ============================================================

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        autoSaveAndReset();
    }, INACTIVITY_LIMIT_MS);
}

let lastActivityTime = 0;
function throttledResetInactivityTimer() {
    const now = Date.now();
    if (now - lastActivityTime > 1000) {
        lastActivityTime = now;
        resetInactivityTimer();
    }
}

['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    document.addEventListener(evt, throttledResetInactivityTimer, true);
});

// ============================================================
// ENABLE / DISABLE ENCODING
// ============================================================

function setEncodingEditable(editable) {
    isEditingActive = editable;
    const inputs = document.querySelectorAll(
        '.main-wrapper input:not(.price-input):not(#modalDateInput):not(#modalNameInput)'
    );

    inputs.forEach(input => {
        if (!input.classList.contains('readonly-col')) {
            input.disabled = !editable;
        }
    });
}

// ============================================================
// PREVIEW MODE INPUT CONTROL
// ============================================================

function setPreviewMode(preview) {
    isPreviewMode = preview;
    document.body.classList.toggle("preview-mode", preview);

    if (preview) {
        isEditingActive = false;
        const inputs = document.querySelectorAll(
            '.main-wrapper input:not(#modalDateInput):not(#modalNameInput)'
        );
        inputs.forEach(input => {
            input.disabled = true;
        });
    } else {
        document.body.classList.remove("preview-mode");
    }
}

// ============================================================
// MODALS (AUTOMATIC DEVICE DATE)
// ============================================================

function showOpenModal() {
    modalMode = "OPEN";
    document.getElementById("modalTitle").textContent = "Start New Ledger File";
    document.getElementById("modalSubtext").textContent = "System date is automatically set to today. Enter Salesman/Route name.";
    document.getElementById("modalActionBtn").textContent = "Open Ledger";

    document.getElementById("modalNameInput").value = "";
    document.getElementById("setupModal").style.display = "flex";
}

function openSaveConfirmationModal() {
    if (!currentSessionDate || !currentSessionName) {
        alert("No active session to save. Please start a session first.");
        return;
    }

    if (isPreviewMode) {
        alert("Preview mode is read-only.");
        return;
    }

    modalMode = "SAVE";
    document.getElementById("modalTitle").textContent = "Confirm & Save Ledger File";
    document.getElementById("modalSubtext").textContent = "Review Salesman/Route name before saving.";
    document.getElementById("modalActionBtn").textContent = "Save File";

    document.getElementById("modalNameInput").value = currentSessionName;
    document.getElementById("setupModal").style.display = "flex";
}

function handleModalSubmit() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;

    const nameVal = document.getElementById("modalNameInput").value.trim();

    if (!nameVal) {
        alert("Please enter Salesman / Route Name!");
        return;
    }

    if (modalMode === "SAVE") {
        currentSessionDate = todayDate;
        currentSessionName = nameVal;
        updateSessionDateDisplay();
        document.getElementById("setupModal").style.display = "none";

        forceSaveCurrentDay();
        clearAllLedgerInputs();

        currentSessionDate = "";
        currentSessionName = "";
        updateSessionDateDisplay();

        localStorage.removeItem("miki_ledger_data");
        setEncodingEditable(false);
        alert("Ledger saved successfully!");
    } else {
        const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
        const existingFile = history.find(item => item.date === todayDate);

        if (existingFile) {
            const confirmContinue = confirm(
                `A saved ledger for TODAY (${todayDate}) already exists.\n\n` +
                `Click OK (CONTINUE) to edit today's file.`
            );

            if (confirmContinue) {
                document.getElementById("setupModal").style.display = "none";
                loadHistoryFile(todayDate);
                return;
            } else {
                return;
            }
        }

        currentSessionDate = todayDate;
        currentSessionName = nameVal;

        updateSessionDateDisplay();
        document.getElementById("setupModal").style.display = "none";

        setPreviewMode(false);
        setEncodingEditable(true);
        resetInactivityTimer();

        applyDefaultNamesIfEmpty();
        saveLedger();
        forceSaveCurrentDay();
        loadRowToMain(1);
    }
}

function closeSetupModal() {
    document.getElementById("setupModal").style.display = "none";
}

function promptNewFile() {
    resetLedgerState();
}

// ============================================================
// AUTO SAVE & RESET
// ============================================================

function autoSaveAndReset() {
    if (currentSessionDate && currentSessionName && !isPreviewMode) {
        forceSaveCurrentDay();
        alert("System auto-saved due to 15 minutes of inactivity.");
        resetLedgerState();
    }
}

function resetLedgerState() {
    setPreviewMode(false);
    previewBackup = null;
    previewDateKey = null;

    currentSessionDate = "";
    currentSessionName = "";
    rowUtangMode = {};
    printCounters = {};

    updateSessionDateDisplay();
    clearAllLedgerInputs();

    localStorage.removeItem("miki_ledger_data");
    setEncodingEditable(false);
    renderHistoryUI();
    showOpenModal();
}

// ============================================================
// DEFAULT NAMES & CLEAR (50 ROWS)
// ============================================================

function applyDefaultNamesIfEmpty() {
    for (let i = 1; i <= 50; i++) {
        const el = document.getElementById(`ledgerName_${i}`);
        if (el && (!el.value || el.value.trim() === "")) {
            el.value = DEFAULT_NAMES[i - 1] || "";
        }
    }
    updateActiveCustomerName(activeRow);
}

function clearAllLedgerInputs() {
    clearMainInputs();

    for (let i = 1; i <= 50; i++) {
        const defaultName = DEFAULT_NAMES[i - 1] || "";
        const nameEl = document.getElementById(`ledgerName_${i}`);
        if (nameEl) nameEl.value = defaultName;
        
        if (document.getElementById(`ledgerDry_${i}`)) document.getElementById(`ledgerDry_${i}`).value = "";
        if (document.getElementById(`ledgerFresh_${i}`)) document.getElementById(`ledgerFresh_${i}`).value = "";
        if (document.getElementById(`ledgerCab_${i}`)) document.getElementById(`ledgerCab_${i}`).value = "";
        if (document.getElementById(`ledgerBo_${i}`)) document.getElementById(`ledgerBo_${i}`).value = "";
        if (document.getElementById(`ledgerBal_${i}`)) document.getElementById(`ledgerBal_${i}`).value = "";
        if (document.getElementById(`ledgerBilling_${i}`)) document.getElementById(`ledgerBilling_${i}`).value = "";
        if (document.getElementById(`ledgerPay_${i}`)) document.getElementById(`ledgerPay_${i}`).value = "";
        if (document.getElementById(`ledgerRem_${i}`)) document.getElementById(`ledgerRem_${i}`).value = "";
    }

    rowUtangMode = {};
    printCounters = {};

    for (let i = 1; i <= 8; i++) {
        if (document.getElementById(`extraItem_${i}`)) document.getElementById(`extraItem_${i}`).value = "";
        if (document.getElementById(`extraAmount_${i}`)) document.getElementById(`extraAmount_${i}`).value = "";
    }

    if (document.getElementById("inputCOH")) document.getElementById("inputCOH").value = "0";

    const note = document.getElementById("newTableNote");
    if (note) note.value = "";

    activeRow = 1;
    updateActiveCustomerName(1);

    calculateLedgerTotals();
    calculateExtraTable();
}

// ============================================================
// LOCKS & TAPS
// ============================================================

function handleKeyClick() {
    if (isPreviewMode) return;

    tapCount++;
    clearTimeout(tapTimer);

    tapTimer = setTimeout(() => {
        tapCount = 0;
    }, 1000);

    if (tapCount >= 5) {
        tapCount = 0;
        isLocked = !isLocked;
        toggleLockState(isLocked);
    }
}

function toggleLockState(locked) {
    const header = document.getElementById("lockHeader");
    if (header) header.textContent = locked ? "🔒" : "🔑";

    const nameInputs = document.querySelectorAll(".name-input");
    nameInputs.forEach(field => {
        field.readOnly = locked;
        field.style.backgroundColor = locked ? "#e5e7eb" : "white";
    });
}

function handlePriceKeyClick() {
    if (isPreviewMode) return;

    priceTapCount++;
    clearTimeout(priceTapTimer);

    priceTapTimer = setTimeout(() => {
        priceTapCount = 0;
    }, 1000);

    if (priceTapCount >= 5) {
        priceTapCount = 0;
        isPriceLocked = !isPriceLocked;
        togglePriceLockState(isPriceLocked);
    }
}

function togglePriceLockState(locked) {
    const header = document.getElementById("priceLockHeader");
    if (header) header.textContent = locked ? "Price 🔒" : "Price 🔑";

    const priceInputs = document.querySelectorAll(".price-input");
    priceInputs.forEach(field => {
        field.readOnly = locked;
        field.style.backgroundColor = locked ? "#e5e7eb" : "white";
    });
}

function handleRowCollTap(row) {
    if (isPreviewMode) return;

    if (!rowTapCounts[row]) rowTapCounts[row] = 0;
    rowTapCounts[row]++;

    clearTimeout(rowTapTimers[row]);
    rowTapTimers[row] = setTimeout(() => {
        rowTapCounts[row] = 0;
    }, 1000);

    if (rowTapCounts[row] >= 5) {
        rowTapCounts[row] = 0;
        rowUtangMode[row] = !rowUtangMode[row];

        if (row === activeRow) {
            calculateMain();
        } else {
            const billingEl = document.getElementById(`ledgerBilling_${row}`);
            const payEl = document.getElementById(`ledgerPay_${row}`);
            const remEl = document.getElementById(`ledgerRem_${row}`);

            if (billingEl && payEl && remEl) {
                const billingVal = parseFloat(billingEl.value.replace(/,/g, '')) || 0;
                if (rowUtangMode[row]) {
                    payEl.value = "";
                    remEl.value = formatMoney(billingVal);
                } else {
                    payEl.value = formatMoney(billingVal);
                    remEl.value = "0";
                }
                calculateLedgerTotals();
            }
        }
    }
}

// ============================================================
// HELPERS
// ============================================================

function getVal(id) {
    const element = document.getElementById(id);
    if (!element) return 0;
    const val = parseFloat(element.value);
    return isNaN(val) ? 0 : val;
}

function formatMoney(value) {
    return Math.round(value).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function updateActiveCustomerName(row) {
    if (row === activeRow) {
        const nameEl = document.getElementById(`ledgerName_${row}`);
        const displayBox = document.getElementById("activeCustomerDisplay");
        if (nameEl && displayBox) {
            const nameVal = nameEl.value.trim();
            displayBox.textContent = nameVal !== "" ? nameVal : `Row ${row}`;
        }
    }
}

// ============================================================
// SYNC & MAIN CALCULATION (SUPPORT 'BO' ALL CAPS)
// ============================================================

function syncFromPanel(type) {
    if (isPreviewMode) return;
    
    let targetType = type;
    if (type.toUpperCase() === "BO") targetType = "Bo";

    const val = document.getElementById("sync" + targetType).value;
    const targetId = targetType === "Dry" ? "qtyReg" : "qty" + targetType;
    
    const targetInput = document.getElementById(targetId);
    if (targetInput) {
        targetInput.value = val;
    }
    calculateMain();
}

function syncFromTable(type) {
    if (isPreviewMode) return;

    let targetType = type;
    if (type.toUpperCase() === "BO") targetType = "Bo";

    const targetId = (type === "Reg" || type === "Dry") ? "syncDry" : "sync" + targetType;
    const val = document.getElementById("qty" + targetType).value;
    
    const syncInput = document.getElementById(targetId);
    if (syncInput) {
        syncInput.value = val;
    }
    calculateMain();
}

function clearMainInputs() {
    document.getElementById("qtyReg").value = "";
    document.getElementById("syncDry").value = "";

    document.getElementById("qtyFresh").value = "";
    document.getElementById("syncFresh").value = "";

    document.getElementById("qtyCab").value = "";
    document.getElementById("syncCab").value = "";

    document.getElementById("qtyBo").value = "";
    document.getElementById("syncBo").value = "";

    document.getElementById("inputBal").value = "";
    document.getElementById("inputPay").value = "";

    calculateMain();
}

function calculateMain() {
    const regQty = getVal("qtyReg");
    const regPrice = getVal("priceReg");
    const regAmount = Math.round(regQty * regPrice);

    const freshQty = getVal("qtyFresh");
    const freshPrice = getVal("priceFresh");
    const freshAmount = Math.round(freshQty * freshPrice);

    const cabQty = getVal("qtyCab");
    const cabPrice = getVal("priceCab");
    const cabAmount = Math.round(cabQty * cabPrice);

    const boQty = getVal("qtyBo");
    const boPrice = getVal("priceBo");
    const boAmount = Math.round((boQty / 2) * boPrice);

    const totalOrdersAmount = regAmount + freshAmount + cabAmount - boAmount;
    const balAmount = Math.round(getVal("inputBal"));
    const payAmount = Math.round(getVal("inputPay"));

    const grandTotalAmount = totalOrdersAmount + balAmount;
    const netTotal = grandTotalAmount - payAmount;

    document.getElementById("amountReg").textContent = formatMoney(regAmount);
    document.getElementById("amountFresh").textContent = formatMoney(freshAmount);
    document.getElementById("amountCab").textContent = formatMoney(cabAmount);
    document.getElementById("amountBo").textContent = formatMoney(boAmount);
    document.getElementById("totalAmount").textContent = formatMoney(totalOrdersAmount);
    document.getElementById("netTotalAmount").textContent = formatMoney(netTotal);

    if (document.getElementById(`ledgerDry_${activeRow}`)) document.getElementById(`ledgerDry_${activeRow}`).value = document.getElementById("qtyReg").value;
    if (document.getElementById(`ledgerFresh_${activeRow}`)) document.getElementById(`ledgerFresh_${activeRow}`).value = document.getElementById("qtyFresh").value;
    if (document.getElementById(`ledgerCab_${activeRow}`)) document.getElementById(`ledgerCab_${activeRow}`).value = document.getElementById("qtyCab").value;
    if (document.getElementById(`ledgerBo_${activeRow}`)) document.getElementById(`ledgerBo_${activeRow}`).value = document.getElementById("qtyBo").value;
    if (document.getElementById(`ledgerBal_${activeRow}`)) document.getElementById(`ledgerBal_${activeRow}`).value = document.getElementById("inputBal").value;
    
    if (document.getElementById(`ledgerBilling_${activeRow}`)) document.getElementById(`ledgerBilling_${activeRow}`).value = formatMoney(totalOrdersAmount);

    const hasPayEntry = document.getElementById("inputPay").value.trim() !== "";
    let collnVal = 0;
    let remVal = 0;

    if (rowUtangMode[activeRow]) {
        collnVal = 0;
        remVal = grandTotalAmount;
        if (document.getElementById(`ledgerPay_${activeRow}`)) document.getElementById(`ledgerPay_${activeRow}`).value = "";
    } else {
        collnVal = hasPayEntry ? payAmount : grandTotalAmount;
        remVal = grandTotalAmount - collnVal;
        if (document.getElementById(`ledgerPay_${activeRow}`)) document.getElementById(`ledgerPay_${activeRow}`).value = formatMoney(collnVal);
    }

    if (document.getElementById(`ledgerRem_${activeRow}`)) document.getElementById(`ledgerRem_${activeRow}`).value = formatMoney(remVal);

    saveGlobalPrices();
    calculateLedgerTotals();
}

function saveGlobalPrices() {
    const pReg = document.getElementById("priceReg")?.value;
    const pFresh = document.getElementById("priceFresh")?.value;
    const pCab = document.getElementById("priceCab")?.value;
    const pBo = document.getElementById("priceBo")?.value;

    if (pReg !== undefined && pFresh !== undefined && pCab !== undefined && pBo !== undefined) {
        localStorage.setItem("miki_saved_prices", JSON.stringify({
            reg: pReg,
            fresh: pFresh,
            cab: pCab,
            bo: pBo
        }));
    }
}

function restoreGlobalPrices() {
    const savedPrices = JSON.parse(localStorage.getItem("miki_saved_prices"));
    
    if (document.getElementById("priceReg")) {
        document.getElementById("priceReg").value = savedPrices?.reg || "50";
    }
    if (document.getElementById("priceFresh")) {
        document.getElementById("priceFresh").value = savedPrices?.fresh || "50";
    }
    if (document.getElementById("priceCab")) {
        document.getElementById("priceCab").value = savedPrices?.cab || "40";
    }
    if (document.getElementById("priceBo")) {
        document.getElementById("priceBo").value = savedPrices?.bo || "50";
    }
}

function loadRowToMain(row) {
    if (!isEditingActive || isPreviewMode) return;

    activeRow = row;
    updateActiveCustomerName(row);

    if (document.getElementById(`ledgerDry_${row}`)) {
        document.getElementById("qtyReg").value = document.getElementById(`ledgerDry_${row}`).value;
        document.getElementById("syncDry").value = document.getElementById(`ledgerDry_${row}`).value;
    }
    if (document.getElementById(`ledgerFresh_${row}`)) {
        document.getElementById("qtyFresh").value = document.getElementById(`ledgerFresh_${row}`).value;
        document.getElementById("syncFresh").value = document.getElementById(`ledgerFresh_${row}`).value;
    }
    if (document.getElementById(`ledgerCab_${row}`)) {
        document.getElementById("qtyCab").value = document.getElementById(`ledgerCab_${row}`).value;
        document.getElementById("syncCab").value = document.getElementById(`ledgerCab_${row}`).value;
    }
    if (document.getElementById(`ledgerBo_${row}`)) {
        document.getElementById("qtyBo").value = document.getElementById(`ledgerBo_${row}`).value;
        document.getElementById("syncBo").value = document.getElementById(`ledgerBo_${row}`).value;
    }
    if (document.getElementById(`ledgerBal_${row}`)) {
        document.getElementById("inputBal").value = document.getElementById(`ledgerBal_${row}`).value;
    }

    const payEl = document.getElementById(`ledgerPay_${row}`);
    if (payEl) {
        const rawColln = payEl.value.replace(/,/g, '');
        document.getElementById("inputPay").value = rawColln !== "" ? rawColln : "";
    }

    calculateMain();
}

function calculateLedgerTotals() {
    let sumDry = 0, sumFresh = 0, sumCab = 0, sumBo = 0;
    let sumBal = 0, sumBilling = 0, sumColln = 0, sumRem = 0;

    for (let i = 1; i <= 50; i++) {
        const dryEl = document.getElementById(`ledgerDry_${i}`);
        if (!dryEl) continue;

        sumDry += parseFloat(dryEl.value) || 0;
        sumFresh += parseFloat(document.getElementById(`ledgerFresh_${i}`).value) || 0;
        sumCab += parseFloat(document.getElementById(`ledgerCab_${i}`).value) || 0;
        sumBo += parseFloat(document.getElementById(`ledgerBo_${i}`).value) || 0;
        sumBal += parseFloat(document.getElementById(`ledgerBal_${i}`).value) || 0;

        const billStr = document.getElementById(`ledgerBilling_${i}`).value.replace(/,/g, '');
        sumBilling += parseFloat(billStr) || 0;

        const collnStr = document.getElementById(`ledgerPay_${i}`).value.replace(/,/g, '');
        sumColln += parseFloat(collnStr) || 0;

        const remStr = document.getElementById(`ledgerRem_${i}`).value.replace(/,/g, '');
        sumRem += parseFloat(remStr) || 0;
    }

    document.getElementById("totalDry").textContent = formatMoney(sumDry);
    document.getElementById("totalFresh").textContent = formatMoney(sumFresh);
    document.getElementById("totalCab").textContent = formatMoney(sumCab);
    document.getElementById("totalBo").textContent = sumBo % 1 === 0 ? sumBo : sumBo.toFixed(1);
    document.getElementById("totalBal").textContent = formatMoney(sumBal);
    document.getElementById("totalBilling").textContent = formatMoney(sumBilling);
    document.getElementById("totalColln").textContent = formatMoney(sumColln);
    document.getElementById("totalRem").textContent = formatMoney(sumRem);

    calculateExtraTable();
}

function calculateExtraTable() {
    let leftTotal = 0;
    let allAmounts = 0;

    const c2Ids = ["extraAmount_1", "extraAmount_3", "extraAmount_5", "extraAmount_7"];
    c2Ids.forEach(id => {
        const element = document.getElementById(id);
        if (element) leftTotal += parseFloat(element.value) || 0;
    });

    for (let i = 1; i <= 8; i++) {
        const element = document.getElementById(`extraAmount_${i}`);
        if (element) allAmounts += parseFloat(element.value) || 0;
    }

    const totalCollnElement = document.getElementById("totalColln");
    const secondTableColln = totalCollnElement ? parseFloat(totalCollnElement.textContent.replace(/,/g, '')) || 0 : 0;
    const collectionPlusExtra = secondTableColln - allAmounts;

    const cohElement = document.getElementById("inputCOH");
    const coh = cohElement ? parseFloat(cohElement.value) || 0 : 0;

    const grandTotal = collectionPlusExtra - coh;

    const c2Total = document.getElementById("extraColumn2Total");
    if (c2Total) c2Total.textContent = formatMoney(leftTotal);

    const c4Total = document.getElementById("extraColumn4Total");
    if (c4Total) c4Total.textContent = formatMoney(allAmounts);

    const collectionDisplay = document.getElementById("collectionPlusExtra");
    if (collectionDisplay) collectionDisplay.textContent = formatMoney(collectionPlusExtra);

    const grandDisplay = document.getElementById("grandTotalAmount");
    if (grandDisplay) grandDisplay.textContent = formatMoney(grandTotal);
}

// ============================================================
// STORAGE & HISTORY (50 ROWS)
// ============================================================

function saveLedger() {
    if (!currentSessionDate || !currentSessionName || !isEditingActive || isPreviewMode) {
        return;
    }

    const noteElement = document.getElementById("newTableNote");

    const ledgerData = {
        date: currentSessionDate,
        name: currentSessionName,
        rows: {},
        utangModes: rowUtangMode,
        printCounters: printCounters,
        extraTable: {
            note: noteElement ? noteElement.value : ""
        },
        prices: {
            reg: document.getElementById("priceReg")?.value || "",
            fresh: document.getElementById("priceFresh")?.value || "",
            cab: document.getElementById("priceCab")?.value || "",
            bo: document.getElementById("priceBo")?.value || ""
        }
    };

    for (let i = 1; i <= 50; i++) {
        const nameEl = document.getElementById(`ledgerName_${i}`);
        if (!nameEl) continue;

        ledgerData.rows[`name_${i}`] = nameEl.value;
        ledgerData.rows[`dry_${i}`] = document.getElementById(`ledgerDry_${i}`).value;
        ledgerData.rows[`fresh_${i}`] = document.getElementById(`ledgerFresh_${i}`).value;
        ledgerData.rows[`cab_${i}`] = document.getElementById(`ledgerCab_${i}`).value;
        ledgerData.rows[`bo_${i}`] = document.getElementById(`ledgerBo_${i}`).value;
        ledgerData.rows[`bal_${i}`] = document.getElementById(`ledgerBal_${i}`).value;
        ledgerData.rows[`billing_${i}`] = document.getElementById(`ledgerBilling_${i}`).value;
        ledgerData.rows[`pay_${i}`] = document.getElementById(`ledgerPay_${i}`).value;
        ledgerData.rows[`rem_${i}`] = document.getElementById(`ledgerRem_${i}`).value;
    }

    for (let i = 1; i <= 8; i++) {
        ledgerData.extraTable[`item_${i}`] = document.getElementById(`extraItem_${i}`).value;
        ledgerData.extraTable[`amount_${i}`] = document.getElementById(`extraAmount_${i}`).value;
    }

    ledgerData.extraTable.coh = document.getElementById("inputCOH").value;

    localStorage.setItem("miki_ledger_data", JSON.stringify(ledgerData));
}

function forceSaveCurrentDay() {
    if (!currentSessionDate || !currentSessionName) return;

    saveLedger();

    const activeDraft = JSON.parse(localStorage.getItem("miki_ledger_data"));
    if (!activeDraft) return;

    let history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    const existingIndex = history.findIndex(item => item.date === activeDraft.date);

    if (existingIndex !== -1) {
        history[existingIndex] = activeDraft;
    } else {
        history.unshift(activeDraft);
    }

    if (history.length > 30) {
        history = history.slice(0, 30);
    }

    localStorage.setItem("miki_30day_history", JSON.stringify(history));
    renderHistoryUI();
}

function getCurrentLedgerSnapshot() {
    const snapshot = {
        date: currentSessionDate,
        name: currentSessionName,
        rows: {},
        utangModes: { ...rowUtangMode },
        printCounters: { ...printCounters },
        extraTable: {
            note: document.getElementById("newTableNote")?.value || ""
        },
        prices: {
            reg: document.getElementById("priceReg")?.value || "",
            fresh: document.getElementById("priceFresh")?.value || "",
            cab: document.getElementById("priceCab")?.value || "",
            bo: document.getElementById("priceBo")?.value || ""
        }
    };

    for (let i = 1; i <= 50; i++) {
        const nameEl = document.getElementById(`ledgerName_${i}`);
        if (!nameEl) continue;

        snapshot.rows[`name_${i}`] = nameEl.value;
        snapshot.rows[`dry_${i}`] = document.getElementById(`ledgerDry_${i}`).value;
        snapshot.rows[`fresh_${i}`] = document.getElementById(`ledgerFresh_${i}`).value;
        snapshot.rows[`cab_${i}`] = document.getElementById(`ledgerCab_${i}`).value;
        snapshot.rows[`bo_${i}`] = document.getElementById(`ledgerBo_${i}`).value;
        snapshot.rows[`bal_${i}`] = document.getElementById(`ledgerBal_${i}`).value;
        snapshot.rows[`billing_${i}`] = document.getElementById(`ledgerBilling_${i}`).value;
        snapshot.rows[`pay_${i}`] = document.getElementById(`ledgerPay_${i}`).value;
        snapshot.rows[`rem_${i}`] = document.getElementById(`ledgerRem_${i}`).value;
    }

    for (let i = 1; i <= 8; i++) {
        snapshot.extraTable[`item_${i}`] = document.getElementById(`extraItem_${i}`).value;
        snapshot.extraTable[`amount_${i}`] = document.getElementById(`extraAmount_${i}`).value;
    }

    snapshot.extraTable.coh = document.getElementById("inputCOH").value;

    return snapshot;
}

function restoreLedgerData(data) {
    if (!data) return;

    clearAllLedgerInputs();

    currentSessionDate = data.date || "";
    currentSessionName = data.name || "";
    rowUtangMode = data.utangModes ? { ...data.utangModes } : {};
    printCounters = data.printCounters ? { ...data.printCounters } : {};

    updateSessionDateDisplay();

    restoreGlobalPrices();
    if (data.prices) {
        if (data.prices.reg && document.getElementById("priceReg")) document.getElementById("priceReg").value = data.prices.reg;
        if (data.prices.fresh && document.getElementById("priceFresh")) document.getElementById("priceFresh").value = data.prices.fresh;
        if (data.prices.cab && document.getElementById("priceCab")) document.getElementById("priceCab").value = data.prices.cab;
        if (data.prices.bo && document.getElementById("priceBo")) document.getElementById("priceBo").value = data.prices.bo;
    }

    for (let i = 1; i <= 50; i++) {
        const nameEl = document.getElementById(`ledgerName_${i}`);
        if (!nameEl) continue;

        if (data.rows && data.rows[`name_${i}`] !== undefined) {
            nameEl.value = data.rows[`name_${i}`];
        }
        if (data.rows && data.rows[`dry_${i}`] !== undefined) document.getElementById(`ledgerDry_${i}`).value = data.rows[`dry_${i}`];
        if (data.rows && data.rows[`fresh_${i}`] !== undefined) document.getElementById(`ledgerFresh_${i}`).value = data.rows[`fresh_${i}`];
        if (data.rows && data.rows[`cab_${i}`] !== undefined) document.getElementById(`ledgerCab_${i}`).value = data.rows[`cab_${i}`];
        if (data.rows && data.rows[`bo_${i}`] !== undefined) document.getElementById(`ledgerBo_${i}`).value = data.rows[`bo_${i}`];
        if (data.rows && data.rows[`bal_${i}`] !== undefined) document.getElementById(`ledgerBal_${i}`).value = data.rows[`bal_${i}`];
        if (data.rows && data.rows[`billing_${i}`] !== undefined) document.getElementById(`ledgerBilling_${i}`).value = data.rows[`billing_${i}`];
        if (data.rows && data.rows[`pay_${i}`] !== undefined) document.getElementById(`ledgerPay_${i}`).value = data.rows[`pay_${i}`];
        if (data.rows && data.rows[`rem_${i}`] !== undefined) document.getElementById(`ledgerRem_${i}`).value = data.rows[`rem_${i}`];
    }

    if (data.extraTable) {
        for (let i = 1; i <= 8; i++) {
            if (data.extraTable[`item_${i}`] !== undefined) document.getElementById(`extraItem_${i}`).value = data.extraTable[`item_${i}`];
            if (data.extraTable[`amount_${i}`] !== undefined) document.getElementById(`extraAmount_${i}`).value = data.extraTable[`amount_${i}`];
        }
        if (data.extraTable.coh !== undefined) document.getElementById("inputCOH").value = data.extraTable.coh;

        const noteElement = document.getElementById("newTableNote");
        if (noteElement) noteElement.value = data.extraTable.note || "";
    }

    applyDefaultNamesIfEmpty();

    calculateLedgerTotals();
    calculateExtraTable();
}

function loadHistoryFile(dateKey) {
    const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    const selectedFile = history.find(item => item.date === dateKey);

    if (!selectedFile) return;

    previewBackup = null;
    previewDateKey = null;

    setPreviewMode(false);
    restoreLedgerData(selectedFile);

    document.getElementById("setupModal").style.display = "none";
    setEncodingEditable(true);

    loadRowToMain(1);
    calculateLedgerTotals();
    calculateExtraTable();

    saveLedger();
    forceSaveCurrentDay();
    renderHistoryUI(dateKey);
    resetInactivityTimer();
}

function previewHistoryFile(dateKey) {
    const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
    const selectedFile = history.find(item => item.date === dateKey);

    if (!selectedFile) return;

    if (isPreviewMode && previewDateKey === dateKey) {
        exitHistoryPreview();
        return;
    }

    if (!isPreviewMode) {
        if (currentSessionDate && currentSessionName) {
            previewBackup = getCurrentLedgerSnapshot();
        } else {
            previewBackup = null;
        }
    }

    previewDateKey = dateKey;
    restoreLedgerData(selectedFile);

    document.getElementById("setupModal").style.display = "none";
    setPreviewMode(true);

    updateSessionDateDisplay();
    calculateLedgerTotals();
    calculateExtraTable();

    renderHistoryUI(dateKey);
    resetInactivityTimer();
}

function exitHistoryPreview() {
    if (!isPreviewMode) return;

    const backup = previewBackup;

    previewBackup = null;
    previewDateKey = null;

    setPreviewMode(false);

    if (backup) {
        restoreLedgerData(backup);
        setEncodingEditable(true);

        loadRowToMain(activeRow || 1);
        calculateLedgerTotals();
        calculateExtraTable();

        updateSessionDateDisplay();
        renderHistoryUI();
        resetInactivityTimer();
        return;
    }

    currentSessionDate = "";
    currentSessionName = "";
    rowUtangMode = {};
    printCounters = {};

    updateSessionDateDisplay();
    clearAllLedgerInputs();
    setEncodingEditable(false);
    renderHistoryUI();
}

function deleteHistoryFile(dateKey) {
    if (confirm(`Delete file for ${dateKey}?`)) {
        let history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");
        history = history.filter(item => item.date !== dateKey);

        localStorage.setItem("miki_30day_history", JSON.stringify(history));

        if (isPreviewMode && previewDateKey === dateKey) {
            exitHistoryPreview();
        } else {
            renderHistoryUI();
        }
    }
}

function renderHistoryUI(selectedDateKey = null) {
    const historyContainer = document.getElementById("historyContainer");
    const historyCount = document.getElementById("historyCount");

    if (!historyContainer || !historyCount) return;

    const history = JSON.parse(localStorage.getItem("miki_30day_history") || "[]");

    historyCount.textContent = `${history.length} / 30`;
    history.sort((a, b) => b.date.localeCompare(a.date));

    if (history.length === 0) {
        historyContainer.innerHTML = `<p style="color:#9ca3af;text-align:center;margin:10px 0;">No saved files yet.</p>`;
        return;
    }

    const highlightKey = selectedDateKey || (isPreviewMode ? previewDateKey : currentSessionDate);
    historyContainer.innerHTML = "";

    history.forEach(item => {
        const div = document.createElement("div");
        const isSelected = item.date === highlightKey;
        const isPreviewFile = isPreviewMode && item.date === previewDateKey;

        div.className = `history-item ${isSelected ? 'selected-file' : ''} ${isPreviewFile ? 'preview-file' : ''}`;

        div.addEventListener("click", function(event) {
            if (event.target.closest("button")) return;
            previewHistoryFile(item.date);
        });

        const infoDiv = document.createElement("div");
        const strong = document.createElement("strong");
        const savedDate = new Date(item.date + "T00:00:00");
        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

        const formattedSavedDate = !isNaN(savedDate.getTime())
            ? monthNames[savedDate.getMonth()] + " " + String(savedDate.getDate()).padStart(2, "0") + ", " + savedDate.getFullYear()
            : item.date;

        strong.textContent = formattedSavedDate;
        infoDiv.appendChild(strong);
        infoDiv.appendChild(document.createTextNode(" - " + item.name));

        const buttonDiv = document.createElement("div");

        const editButton = document.createElement("button");
        editButton.className = "btn-sm btn-edit";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", function(event) {
            event.stopPropagation();
            loadHistoryFile(item.date);
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "btn-sm btn-del";
        deleteButton.textContent = "Del";
        deleteButton.addEventListener("click", function(event) {
            event.stopPropagation();
            deleteHistoryFile(item.date);
        });

        buttonDiv.appendChild(editButton);
        buttonDiv.appendChild(deleteButton);

        div.appendChild(infoDiv);
        div.appendChild(buttonDiv);

        historyContainer.appendChild(div);
    });
}

function loadLedger() {
    restoreGlobalPrices();
    renderHistoryUI();

    const priceInputs = document.querySelectorAll('.price-input');
    priceInputs.forEach(input => {
        input.addEventListener('input', calculateMain);
    });

    setPreviewMode(false);
    setEncodingEditable(false);
    updateSessionDateDisplay();
    showOpenModal();
}

// ============================================================
// DIRECT WEB BLUETOOTH PRINTER MANAGEMENT (STABLE CLEAN)
// ============================================================

let bluetoothDevice = null;
let bluetoothCharacteristic = null;

async function connectBluetoothPrinter() {
    try {
        console.log("Searching for Bluetooth Thermal Printer...");
        
        // Nilagyan natin ng filters para iyon lang mga may kinalaman sa printer ang lumabas
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'PT' },
                { namePrefix: 'MTP' },
                { namePrefix: 'POS' },
                { namePrefix: 'Printer' },
                { namePrefix: 'BlueTooth Printer' }
            ],
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb', // Standard Serial / Printer UUID
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                '00001101-0000-1000-8000-00805f9b34fb'  // SPP UUID
            ]
        });

        alert("Pairing with: " + (bluetoothDevice.name || "Printer"));
        const server = await bluetoothDevice.gatt.connect();
        
        const services = await server.getPrimaryServices();
        for (const service of services) {
            const characteristics = await service.getCharacteristics();
            for (const char of characteristics) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    bluetoothCharacteristic = char;
                    break;
                }
            }
            if (bluetoothCharacteristic) break;
        }

        if (bluetoothCharacteristic) {
            alert("SUCCESS! Printer Connected.");
        } else {
            alert("Printer connected, but write channel was not found.");
        }
    } catch (error) {
        console.error("Bluetooth Connection Error:", error);
        alert("Bluetooth Error: " + error.message);
    }
}


async function sendToPrinter(textData) {
    if (!bluetoothCharacteristic) {
        const connectNow = confirm("Printer not connected yet. Do you want to pair/connect your Bluetooth Printer now?");
        if (connectNow) {
            await connectBluetoothPrinter();
        }
        if (!bluetoothCharacteristic) return false;
    }

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(textData);
        
        const chunkSize = 256; 
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            if (bluetoothCharacteristic.properties.writeWithoutResponse) {
                await bluetoothCharacteristic.writeValueWithoutResponse(chunk);
            } else {
                await bluetoothCharacteristic.writeValue(chunk);
            }
        }
        return true;
    } catch (err) {
        console.error("Print Error:", err);
        alert("Printing failed. Reconnecting...");
        bluetoothCharacteristic = null;
        return false;
    }
}

// ============================================================
// PRINT ACTIVE ROW RECEIPT
// ============================================================
function printActiveRowReceipt() {
    if (activeRow) {
        printRowReceipt(activeRow);
    } else {
        alert("Pumili muna ng customer bago mag-print!");
    }
}

// ==========================================
// DIRECT WEB BLUETOOTH PRINTER INTEGRATION & LOGGING
// ==========================================
async function printRowReceipt(rowNum) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    const sessionDate = currentSessionDate || todayDate;
    const storageKey = `miki_counter_${sessionDate}_global`;

    let currentCount = parseInt(localStorage.getItem(storageKey)) || 0;
    currentCount += 1;
    localStorage.setItem(storageKey, currentCount.toString());

    saveLedger();
    forceSaveCurrentDay();

    const nameInput = document.getElementById(`ledgerName_${rowNum}`);
    const customerName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : `Customer ${rowNum}`;
    
    const dry = parseFloat(document.getElementById(`ledgerDry_${rowNum}`).value) || 0;
    const fresh = parseFloat(document.getElementById(`ledgerFresh_${rowNum}`).value) || 0;
    const cab = parseFloat(document.getElementById(`ledgerCab_${rowNum}`).value) || 0;
    const bo = parseFloat(document.getElementById(`ledgerBo_${rowNum}`).value) || 0;
    const bal = parseFloat(document.getElementById(`ledgerBal_${rowNum}`).value) || 0;

    const priceReg = parseFloat(document.getElementById("priceReg")?.value) || 50;
    const priceFresh = parseFloat(document.getElementById("priceFresh")?.value) || 50;
    const priceCab = parseFloat(document.getElementById("priceCab")?.value) || 40;
    const priceBo = parseFloat(document.getElementById("priceBo")?.value) || 50;

    const dryAmt = dry * priceReg;
    const freshAmt = fresh * priceFresh;
    const cabAmt = cab * priceCab;
    const boAmt = (bo / 2) * priceBo;
    
    const billingStr = document.getElementById(`ledgerBilling_${rowNum}`).value.replace(/,/g, '');
    const billing = parseFloat(billingStr) || 0;
    
    const paymentStr = document.getElementById(`ledgerPay_${rowNum}`).value.replace(/,/g, '');
    const payment = parseFloat(paymentStr) || 0;
    
    const utangStr = document.getElementById(`ledgerRem_${rowNum}`).value.replace(/,/g, '');
    const utang = parseFloat(utangStr) || 0;

    const grandTotal = billing + bal;

    // Record print log for history tracing
    recordPrintLog(rowNum, customerName, dry, fresh, cab, bo, bal, billing, payment, utang, currentCount);

    const dateVal = document.getElementById("displayFileDate") ? document.getElementById("displayFileDate").innerText : "TODAY";
    const routeName = document.getElementById("displayFileName") ? document.getElementById("displayFileName").innerText : "Paul";

    const now = new Date();
    const timeVal = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const ESC_INIT = "\x1B\x40";
    const ESC_ALIGN_CENTER = "\x1B\x61\x01";
    const ESC_ALIGN_LEFT = "\x1B\x61\x00";
    const ESC_FONT_A = "\x1B\x21\x00";

    const itemLine1 = "DRY   " + String(dry).padEnd(5) + "    P " + String(dryAmt.toFixed(2)).padStart(8);
    const itemLine2 = "FRESH " + String(fresh).padEnd(5) + "    P " + String(freshAmt.toFixed(2)).padStart(8);
    const itemLine3 = "CAB   " + String(cab).padEnd(5) + "    P " + String(cabAmt.toFixed(2)).padStart(8);
    const itemLine4 = "BO    " + String(bo).padEnd(5) + "    P " + String(boAmt.toFixed(2)).padStart(8);

    const singleReceiptText = ESC_INIT + ESC_FONT_A + ESC_ALIGN_CENTER +
"================================\n" +
"         Blessed Day po         \n" +
"================================\n" +
ESC_ALIGN_LEFT +
"Date: " + dateVal + "\n" +
"Time: " + timeVal + "\n" +
"Route: " + routeName + "\n" +
"Customer: " + customerName + "\n" +
"Print Copy #" + currentCount + "\n" +
"--------------------------------\n" +
"ITEM    QTY           AMOUNT    \n" +
"--------------------------------\n" +
itemLine1   + "\n" +
itemLine2   + "\n" +
itemLine3   + "\n" +
itemLine4   + "\n" +
"--------------------------------\n" +
"BILLING:          P " + String(billing.toFixed(2)).padStart(10) + "\n" +
"PREV. BAL:        P " + String(bal.toFixed(2)).padStart(10) + "\n" +
"--------------------------------\n" +
"GRAND TOTAL:      P " + String(grandTotal.toFixed(2)).padStart(10) + "\n" +
"Payment:          P " + String(payment.toFixed(2)).padStart(10) + "\n" +
"--------------------------------\n" +
"Balance:          P " + String(utang.toFixed(2)).padStart(10) + "\n" +
"================================\n" +
ESC_ALIGN_CENTER +
"  Salamat po sa Pagtangkilik!  \n" +
"================================\n\n\n\n\n\n";

    await sendToPrinter(singleReceiptText);
}
// ============================================================
// TARGETED SCREENSHOT FUNCTION (Date Bar, 2nd Table, 3rd Table & Notes Only)
// ============================================================
function takeScreenshot() {
    // Kukuha lang tayo ng Session Bar (Date & Name), 2nd Table, 3rd Table, at Note Bar
    const sessionBar = document.querySelector('.session-bar');
    const table2 = document.querySelector('.table-box-2');
    const table3 = document.querySelector('.table-box-3');
    const noteBar = document.getElementById('newTableNoteBar');

    if (!table2 || !table3) {
        alert("Hindi mahanap ang tables para sa screenshot.");
        return;
    }

    // Gagawa ng temporary wrapper element para pagsama-samahin sila
    const captureContainer = document.createElement('div');
    captureContainer.style.padding = '10px';
    captureContainer.style.backgroundColor = '#f3f4f6';
    captureContainer.style.width = document.querySelector('.main-wrapper').clientWidth + 'px';

    // Idagdag ang mga napiling bahagi (wala na ang switch button)
    if (sessionBar) captureContainer.appendChild(sessionBar.cloneNode(true));
    captureContainer.appendChild(table2.cloneNode(true));
    captureContainer.appendChild(table3.cloneNode(true));
    if (noteBar) captureContainer.appendChild(noteBar.cloneNode(true));

    // Ilalagay sa labas ng screen sandali para ma-render ng html2canvas
    captureContainer.style.position = 'absolute';
    captureContainer.style.left = '-9999px';
    captureContainer.style.top = '-9999px';
    document.body.appendChild(captureContainer);

    html2canvas(captureContainer, {
        scale: 2, // Para mataas ang kalidad at linaw
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        const fileName = `miki-summary-${currentSessionDate || 'shot'}.png`;
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();

        // Linisin ang temporary container
        document.body.removeChild(captureContainer);
    }).catch(err => {
        console.error("Screenshot Error:", err);
        if (captureContainer.parentNode) {
            document.body.removeChild(captureContainer);
        }
        alert("Hindi makagawa ng screenshot. Subukan ulit.");
    });
}
// ============================================================
// 1. DYNAMIC ROWS LOGIC & RENDERING
// ============================================================
let totalActiveRows = 1;

function renderDynamicTableRows() {
    const tbody = document.getElementById("ledgerTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    for (let i = 1; i <= totalActiveRows; i++) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <input type="text" class="name-input" id="ledgerName_${i}" 
                       oninput="handleRowNameInput(${i})" 
                       onfocus="loadRowToMain(${i})" readonly style="background-color:#e5e7eb;">
            </td>
            <td><input type="text" class="readonly-col" id="ledgerDry_${i}" readonly onfocus="loadRowToMain(${i})"></td>
            <td><input type="text" class="readonly-col" id="ledgerFresh_${i}" readonly onfocus="loadRowToMain(${i})"></td>
            <td><input type="text" class="readonly-col" id="ledgerCab_${i}" readonly onfocus="loadRowToMain(${i})"></td>
            <td><input type="text" class="readonly-col" id="ledgerBo_${i}" readonly onfocus="loadRowToMain(${i})"></td>
            <td><input type="text" class="readonly-col" id="ledgerBal_${i}" readonly onfocus="loadRowToMain(${i})"></td>
            <td><input type="text" class="readonly-col amount" id="ledgerBilling_${i}" readonly></td>
            <td><input type="text" class="readonly-col colln-input" id="ledgerPay_${i}" readonly onclick="handleRowCollTap(${i})" onfocus="loadRowToMain(${i})"></td>
            <td><input type="text" class="readonly-col amount" id="ledgerRem_${i}" readonly></td>
        `;
        tbody.appendChild(tr);
    }
}

// Bawat type sa Name Bar sa tabi ng Print Button
function handleActiveCustomerNameChange(val) {
    const currentNameEl = document.getElementById(`ledgerName_${activeRow}`);
    if (currentNameEl) {
        currentNameEl.value = val;
    }

    // Kapag pinunan ang huling row, magdagdag ng 1 bagong blangkong row sa ilalim
    if (activeRow === totalActiveRows && val.trim() !== "") {
        totalActiveRows++;
        renderDynamicTableRows();
        if (typeof restoreCurrentInputsToDOM === 'function') restoreCurrentInputsToDOM();
    }
    
    saveLedger();
}

// Kapag nag-type direkta sa name row ng 2nd table
function handleRowNameInput(row) {
    if (row === activeRow) {
        const inputTop = document.getElementById("activeCustomerInput");
        if (inputTop) inputTop.value = document.getElementById(`ledgerName_${row}`).value;
    }

    if (row === totalActiveRows && document.getElementById(`ledgerName_${row}`).value.trim() !== "") {
        totalActiveRows++;
        renderDynamicTableRows();
        if (typeof restoreCurrentInputsToDOM === 'function') restoreCurrentInputsToDOM();
    }

    saveLedger();
}

function updateActiveCustomerName(row) {
    if (row === activeRow) {
        const nameVal = document.getElementById(`ledgerName_${row}`)?.value || "";
        const inputTop = document.getElementById("activeCustomerInput");
        if (inputTop) inputTop.value = nameVal;
    }
}


// ============================================================
// 2. TARGETED & DYNAMIC SCREENSHOT (Wala ang Empty Rows)
// ============================================================
function takeScreenshot() {
    const sessionBar = document.querySelector('.session-bar');
    const table2 = document.querySelector('.table-box-2');
    const table3 = document.querySelector('.table-box-3');
    const noteBar = document.getElementById('newTableNoteBar');

    if (!table2 || !table3) {
        alert("Hindi mahanap ang tables para sa screenshot.");
        return;
    }

    const captureContainer = document.createElement('div');
    captureContainer.style.padding = '10px';
    captureContainer.style.backgroundColor = '#f3f4f6';
    captureContainer.style.width = document.querySelector('.main-wrapper').clientWidth + 'px';

    if (sessionBar) captureContainer.appendChild(sessionBar.cloneNode(true));

    const clonedTable2 = table2.cloneNode(true);
    const scrollBox = clonedTable2.querySelector('.table-scroll-container');
    if (scrollBox) {
        scrollBox.style.maxHeight = 'none';
        scrollBox.style.overflow = 'visible';
    }

    // I-filter ang blangkong rows para hindi sumama sa screenshot
    const rows = clonedTable2.querySelectorAll('tbody tr');
    rows.forEach(tr => {
        if (tr.querySelector('.net-total-red')) return;

        const nameInput = tr.querySelector('.name-input');
        const dryInput = tr.querySelector('[id^="ledgerDry_"]');
        const billingInput = tr.querySelector('[id^="ledgerBilling_"]');

        const nameVal = nameInput ? nameInput.value.trim() : '';
        const dryVal = dryInput ? dryInput.value.trim() : '';
        const billingVal = billingInput ? billingInput.value.trim() : '';

        const hasData = (nameVal !== '') || (dryVal !== '' && dryVal !== '0') || (billingVal !== '' && billingVal !== '0');

        if (!hasData) {
            tr.style.display = 'none';
        }
    });

    captureContainer.appendChild(clonedTable2);
    captureContainer.appendChild(table3.cloneNode(true));
    if (noteBar) captureContainer.appendChild(noteBar.cloneNode(true));

    captureContainer.style.position = 'absolute';
    captureContainer.style.left = '-9999px';
    captureContainer.style.top = '-9999px';
    document.body.appendChild(captureContainer);

    html2canvas(captureContainer, {
        scale: 2,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        const fileName = `miki-summary-${currentSessionDate || 'shot'}.png`;
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();

        document.body.removeChild(captureContainer);
    }).catch(err => {
        console.error("Screenshot Error:", err);
        if (captureContainer.parentNode) {
            document.body.removeChild(captureContainer);
        }
        alert("Hindi makagawa ng screenshot. Subukan ulit.");
    });
}
