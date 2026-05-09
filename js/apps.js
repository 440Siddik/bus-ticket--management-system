// ==========================================
// 1. DATA & STATE (The "Brain")
// ==========================================
const API = {
    divisions: {
        Dhaka: ["Dhaka", "Faridpur", "Gazipur", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
        Chattogram: ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cox's Bazar", "Cumilla", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
        Rajshahi: ["Bogura", "Joypurhat", "Naogaon", "Natore", "Chapainawabganj", "Pabna", "Rajshahi", "Sirajganj"],
        Khulna: ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
        Barishal: ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
        Sylhet: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
        Rangpur: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
        Mymensingh: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"]
    },
    multipliers: { Regular: 1.0, AC: 1.5, Luxury: 2.2, Sleeper: 3.0 },
    coupons: { "NEW15": 0.15, "Couple 20": 0.20 }
};

const state = {
    isValid: false,
    pricePerSeat: 0,
    selectedSeats: [], 
    discountAmt: 0,
    maxSeats: 4,
    get total() { return this.selectedSeats.length * this.pricePerSeat; },
    get grandTotal() { return this.total - this.discountAmt; }
};

const mySessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
const lockTimers = {}; 

// ==========================================
// 2. DOM ELEMENTS (The "Senses")
// ==========================================
const $ = id => document.getElementById(id);

const els = {
    origDiv: $("origin-division"), origDist: $("origin-district"),
    destDiv: $("dest-division"), destDist: $("dest-district"),
    busClass: $("bus-class"), date: $("journey-date"), time: $("journey-time"),
    seats: document.querySelectorAll(".seat-btn"),
    overlay: $("seat-overlay"), nextBtn: $("next-btn"), applyBtn: $("applybtn"),
    passengerForm: $("passengerForm"), feedbackForm: $("feedbackForm"),
    searchInput: $("global-search-input"), searchResults: $("search-results-list")
};

// ==========================================
// 3. CORE LOGIC & UI RENDERING (The "Hands")
// ==========================================
function init() {
    Object.keys(API.divisions).sort().forEach(div => {
        els.origDiv.innerHTML += `<option value="${div}">${div}</option>`;
        els.destDiv.innerHTML += `<option value="${div}">${div}</option>`;
    });
    els.date.min = new Date().toISOString().split("T")[0];
    
    els.seats.forEach(seat => {
        const id = seat.innerText.trim();
        if (id.endsWith('1') || id.endsWith('4')) {
            seat.setAttribute('title', 'Window Seat 🪟');
            seat.classList.add('window-seat'); 
        }
    });

    if (window.initializeMap) window.initializeMap();
    initFirebaseRealtimeSeats();
}

let dbSeatsRef;
function initFirebaseRealtimeSeats() {
    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            const db = firebase.database();
            dbSeatsRef = db.ref('bus_009/seats');

            dbSeatsRef.on('value', (snapshot) => {
                const seatsData = snapshot.val() || {};
                const now = Date.now();
                
                els.seats.forEach(btn => {
                    const seatId = btn.innerText.trim();
                    const seatInfo = seatsData[seatId];
                    
                    btn.classList.remove('bg-danger', 'text-white', 'bg-secondary', 'pe-none');
                    btn.style.opacity = "1";
                    btn.removeAttribute('title');
                    
                    if (seatInfo) {
                        if (seatInfo.status === 'booked') {
                            btn.classList.add('bg-secondary', 'text-white', 'pe-none');
                            btn.style.opacity = "0.5";
                            btn.setAttribute('title', 'Sold Out');
                            
                            if (state.selectedSeats.includes(seatId) && seatInfo.bookedBySession !== mySessionId) {
                                handleSeatClick(btn, true); 
                                window.showToast(`Seat ${seatId} was just purchased by someone else!`, true);
                            }
                        } 
                        else if (seatInfo.status === 'locked') {
                            if (now - (seatInfo.lockedAt || 0) > 60000) {
                                // Ignore expired locks locally
                            } else if (seatInfo.lockedBy !== mySessionId) {
                                btn.classList.add('bg-danger', 'text-white', 'pe-none');
                                btn.setAttribute('title', 'Currently being reviewed by another user');
                            }
                        }
                    }
                });
            });
        }
    } catch (e) {
        console.warn("Firebase Realtime DB not ready yet.", e);
    }
}

function handleLocationChange(divEl, distEl) {
    const dists = API.divisions[divEl.value] || [];
    distEl.innerHTML = `<option value="" selected disabled>Select District...</option>`;
    dists.sort().forEach(d => distEl.innerHTML += `<option value="${d}">${d}</option>`);
    distEl.disabled = dists.length === 0;
    validateJourney();
}

function validateJourney() {
    const { origDist, destDist, date, time, busClass } = els;
    
    if (origDist.value && destDist.value && date.value && time.value) {
        if (origDist.value === destDist.value) {
            window.showToast("Origin and Destination cannot be the same.", true);
            return setJourneyValid(false);
        }
        
        setJourneyValid(true);
        
        let base = (els.origDiv.value !== els.destDiv.value) ? 800 : 400;
        base += Math.abs(origDist.value.length - destDist.value.length) * 25;

        state.pricePerSeat = Math.round((base * API.multipliers[busClass.value]) / 50) * 50;
        
        if ($("display-route")) $("display-route").innerText = `${origDist.value} - ${destDist.value}`;
        if ($("display-boarding")) $("display-boarding").innerText = origDist.value;
        if ($("display-dropping")) $("display-dropping").innerText = destDist.value;
        if ($("display-time")) $("display-time").innerText = time.value;
        if ($("display-date")) $("display-date").innerText = new Date(date.value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        if ($("display-price")) $("display-price").innerText = state.pricePerSeat;
        if ($("display-coach-class")) $("display-coach-class").innerText = `Coach-009-WEB ! ${busClass.options[busClass.selectedIndex].text}`;
        
        if ($("display-duration")) $("display-duration").innerText = "Calculating live ETA...";
        if ($("display-distance")) $("display-distance").innerText = "Calculating..."; 
        
        if (window.updateRoute) {
            window.updateRoute(origDist.value, destDist.value);
        }

        if (state.selectedSeats.length > 0) {
            window.showToast("Journey changed. Please re-select your seats.", false);
            resetSeats();
        }
    } else {
        setJourneyValid(false);
    }
}

function setJourneyValid(isValid) {
    state.isValid = isValid;
    if (isValid) els.overlay.classList.add("d-none");
    else els.overlay.classList.remove("d-none");
}

function handleSeatClick(btn, forceUnclick = false) {
    if (!window.isUserLoggedIn && !forceUnclick) {
        const modal = bootstrap.Modal.getOrCreateInstance($("authModal"));
        modal.show();
        window.showToast("You must be logged in to select seats.", true);
        return;
    }

    if (!state.isValid) return;
    const seatId = btn.innerText.trim();

    if (state.selectedSeats.includes(seatId) || forceUnclick) {
        state.selectedSeats = state.selectedSeats.filter(id => id !== seatId);
        btn.classList.remove("seatColor");
        
        if (dbSeatsRef) dbSeatsRef.child(seatId).remove();
        clearTimeout(lockTimers[seatId]); 
        
        renderUI();
        return; 
    }

    if (state.selectedSeats.length >= state.maxSeats) return window.showToast("Maximum 4 seats allowed.", true);

    state.selectedSeats.push(seatId);
    btn.classList.add("seatColor");
    
    if (dbSeatsRef) {
        const ref = dbSeatsRef.child(seatId);
        ref.set({
            status: 'locked',
            lockedBy: mySessionId,
            lockedAt: Date.now()
        });
        ref.onDisconnect().remove(); 
    }

    lockTimers[seatId] = setTimeout(() => {
        if (state.selectedSeats.includes(seatId)) {
            window.showToast(`Seat ${seatId} was released due to 60 seconds of inactivity.`, true);
            handleSeatClick(btn, true); 
        }
    }, 60000);
    
    const badge = $("nav-cart-badge");
    badge.classList.remove("animation-pop");
    void badge.offsetWidth; 
    badge.classList.add("animation-pop");

    renderUI();
}

function renderUI() {
    $("ticket-count").innerText = state.selectedSeats.length;
    $("seat-count").innerText = 40 - state.selectedSeats.length; 
    
    $("total-price").innerText = state.total;
    $("grand-total").innerText = state.grandTotal;
    
    $("selected-seat-num").innerHTML = state.selectedSeats.map(seat => `
        <div class="seatClass">
            <p class="font-inter text-dark-muted m-0">${seat}</p>
            <p class="font-inter text-dark-muted m-0">${els.busClass.value}</p>
            <p class="font-inter text-dark-muted m-0">${state.pricePerSeat}</p>
        </div>
    `).join("");

    els.applyBtn.disabled = state.selectedSeats.length !== state.maxSeats;
    checkFormReady();
    updateMiniCart();
}

function resetSeats() {
    if (dbSeatsRef && state.selectedSeats.length > 0) {
        state.selectedSeats.forEach(seatId => {
            dbSeatsRef.child(seatId).remove();
            clearTimeout(lockTimers[seatId]);
        });
    }

    state.selectedSeats = [];
    state.discountAmt = 0;
    els.seats.forEach(btn => {
        btn.classList.remove("seatColor");
    });
    $("couponSection").style.display = "flex";
    $("couponSection").style.opacity = "1";
    $("coupon-code").value = "";
    $("discount-price").innerHTML = "";
    renderUI();
}

function checkFormReady() {
    const nameValid = $("passName").value.trim().length > 0;
    const phoneValid = $("phoneNumber").value.trim().length >= 11;
    els.nextBtn.disabled = !(state.selectedSeats.length > 0 && nameValid && phoneValid);
}

function updateMiniCart() {
    const emptyState = $("cart-empty-state");
    const filledState = $("cart-filled-state");
    const invoiceState = $("cart-invoice-state");
    const badge = $("nav-cart-badge");

    invoiceState.classList.add("d-none");
    invoiceState.classList.remove("d-flex");

    if (state.selectedSeats.length === 0) {
        emptyState.classList.remove("d-none");
        filledState.classList.add("d-none");
        badge.classList.add("d-none");
        badge.classList.replace("bg-success", "bg-danger");
    } else {
        emptyState.classList.add("d-none");
        filledState.classList.remove("d-none");
        badge.classList.remove("d-none");
        badge.classList.replace("bg-success", "bg-danger");
        
        badge.innerText = state.selectedSeats.length;
        $("cart-seat-badge").innerText = `${state.selectedSeats.length}/${state.maxSeats}`;
        $("cart-route").innerText = $("display-route").innerText;
        $("cart-total").innerText = state.grandTotal;

        $("cart-seats-list").innerHTML = state.selectedSeats.map(seat => `
            <li class="list-group-item d-flex justify-content-between align-items-center px-0 bg-transparent border-bottom border-light">
                <span class="font-inter fw-bold text-dark-main">Seat ${seat}</span>
                <span class="text-muted small">BDT ${state.pricePerSeat}</span>
            </li>
        `).join("");
    }
}

window.showToast = function(msg, isError = false) {
    $("toastMessage").innerText = msg;
    const toastEl = $("systemToast");
    toastEl.className = `toast align-items-center text-white border-0 shadow-lg rounded-3 ${isError ? "bg-danger" : "bg-dark"}`;
    new bootstrap.Toast(toastEl).show();
}

// ==========================================
// 4. EVENT LISTENERS & FORM SUBMISSIONS
// ==========================================
els.origDiv.addEventListener("change", () => handleLocationChange(els.origDiv, els.origDist));
els.destDiv.addEventListener("change", () => handleLocationChange(els.destDiv, els.destDist));
[els.origDist, els.destDist, els.busClass, els.date, els.time].forEach(el => el.addEventListener("change", validateJourney));
els.seats.forEach(btn => btn.addEventListener("click", () => handleSeatClick(btn)));
["passName", "phoneNumber"].forEach(id => $(id).addEventListener("input", checkFormReady));

els.applyBtn.addEventListener("click", () => {
    const code = $("coupon-code").value.trim();
    if (!API.coupons[code]) return window.showToast("Invalid coupon code.", true);
    
    state.discountAmt = state.total * API.coupons[code];
    
    $("couponSection").style.opacity = "0";
    setTimeout(() => $("couponSection").style.display = "none", 300);
    
    $("discount-price").innerHTML = `
        <div class="d-flex justify-content-between text-success border-bottom pb-2">
            <p class="m-0">Discount Applied</p>
            <p class="m-0">- BDT ${state.discountAmt}</p>
        </div>`;
    
    window.showToast("Coupon applied successfully!");
    renderUI();
});

els.passengerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!els.passengerForm.checkValidity()) return els.passengerForm.classList.add("was-validated");

    const originalText = els.nextBtn.innerHTML;
    els.nextBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Processing...';
    els.nextBtn.disabled = true;

    setTimeout(() => {
        els.nextBtn.innerHTML = originalText;
        els.nextBtn.disabled = false;

        $("cart-empty-state").classList.add("d-none");
        $("cart-filled-state").classList.add("d-none");
        $("cart-invoice-state").classList.remove("d-none");
        $("cart-invoice-state").classList.add("d-flex");

        // Populate visual DOM
        $("invoice-name").innerText = $("passName").value;
        $("invoice-phone").innerText = $("phoneNumber").value;
        $("invoice-email").innerText = $("passEmail").value || "Not provided";
        $("invoice-route").innerText = $("display-route").innerText;
        $("invoice-date").innerText = $("display-date").innerText;
        $("invoice-time").innerText = $("display-time").innerText;
        $("invoice-total").innerText = state.grandTotal;
        $("invoice-seats").innerText = state.selectedSeats.join(", ");

        const badge = $("nav-cart-badge");
        badge.classList.replace("bg-danger", "bg-success");
        badge.innerHTML = "✓";
        badge.classList.remove("animation-pop");
        void badge.offsetWidth;
        badge.classList.add("animation-pop");

        if (dbSeatsRef && state.selectedSeats.length > 0) {
            state.selectedSeats.forEach(seatId => {
                clearTimeout(lockTimers[seatId]); 
                dbSeatsRef.child(seatId).set({
                    status: 'booked',
                    bookedBySession: mySessionId, 
                    bookedBy: $("passName").value
                });
            });
        }

        $("couponSection").style.display = "flex";
        $("couponSection").style.opacity = "1";
        $("coupon-code").value = "";
        $("discount-price").innerHTML = "";
        els.applyBtn.disabled = true;
        els.passengerForm.reset();
        els.passengerForm.classList.remove("was-validated");

        new bootstrap.Modal($("my_modal_1")).show();
    }, 1200);
});

const viewTicketBtn = $("viewTicketBtn");
if (viewTicketBtn) {
    viewTicketBtn.addEventListener("click", () => {
        const modal = bootstrap.Modal.getInstance($("my_modal_1"));
        if (modal) modal.hide();
        
        setTimeout(() => {
            const offcanvasEl = $("ticketCartOffcanvas");
            let offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
            if (!offcanvas) offcanvas = new bootstrap.Offcanvas(offcanvasEl);
            offcanvas.show();
        }, 300);
    });
}

const ticketCartOffcanvas = $("ticketCartOffcanvas");
if (ticketCartOffcanvas) {
    ticketCartOffcanvas.addEventListener('hidden.bs.offcanvas', () => {
        if (!$("cart-invoice-state").classList.contains("d-none")) {
            $("cart-invoice-state").classList.add("d-none");
            $("cart-invoice-state").classList.remove("d-flex");
            $("cart-empty-state").classList.remove("d-none");

            const badge = $("nav-cart-badge");
            badge.classList.add("d-none");
            badge.innerText = "0";
            
            state.selectedSeats = [];
            state.discountAmt = 0;
            $("ticket-count").innerText = 0;
            $("seat-count").innerText = 40;
            $("total-price").innerText = 0;
            $("grand-total").innerText = 0;
            $("selected-seat-num").innerHTML = "";
            els.seats.forEach(btn => btn.classList.remove("seatColor"));
        }
    });
}

window.addEventListener("userLoggedOut", () => {
    resetSeats();
    els.passengerForm.reset();
    els.passengerForm.classList.remove("was-validated");
    
    $("cart-empty-state").classList.remove("d-none");
    $("cart-filled-state").classList.add("d-none");
    $("cart-invoice-state").classList.add("d-none");
    $("cart-invoice-state").classList.remove("d-flex");
    $("nav-cart-badge").classList.add("d-none");
});

if (els.feedbackForm) {
    els.feedbackForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        if (!window.isUserLoggedIn) {
            const modal = bootstrap.Modal.getOrCreateInstance($("authModal"));
            modal.show();
            window.showToast("You must be logged in to submit feedback.", true);
            return;
        }

        if (!els.feedbackForm.checkValidity()) return els.feedbackForm.classList.add("was-validated");

        const btn = $("feedback-submit-btn");
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Sending...';
        btn.disabled = true;

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            const type = $("feedbackType").value;
            els.feedbackForm.reset();
            els.feedbackForm.classList.remove("was-validated");

            if (type === "complaint") window.showToast("Complaint registered. Authority will contact you.", false);
            else if (type === "lost") window.showToast("Report submitted. We will check lost & found.", false);
            else window.showToast("Thank you! Your feedback helps us improve.", false);
        }, 1500);
    });
}

const searchIndex = [];
for (const [div, dists] of Object.entries(API.divisions)) {
    searchIndex.push({ name: div, type: "Division", parent: div });
    dists.forEach(dist => searchIndex.push({ name: dist, type: "District", parent: div }));
}

els.searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    els.searchResults.innerHTML = "";
    
    if (!query) return $("search-placeholder").style.display = "block";
    $("search-placeholder").style.display = "none";

    const results = searchIndex.filter(loc => loc.name.toLowerCase().includes(query));
    
    if (results.length === 0) {
        els.searchResults.innerHTML = `<li class="text-center text-danger py-3">No locations found.</li>`;
        return;
    }

    results.forEach(loc => {
        const li = document.createElement("li");
        li.className = "d-flex justify-content-between align-items-center font-inter text-dark-main border-bottom border-light p-2 cursor-pointer hover-bg-light";
        li.innerHTML = `
            <div>
                <span class="fs-5">${loc.name.replace(new RegExp(`(${query})`, "gi"), "<span class='text-primary-green fw-bold'>$1</span>")}</span>
                <span class="text-muted small d-block">${loc.type === "District" ? `District in ${loc.parent}` : "Division"}</span>
            </div>
            <span class="badge bg-light text-dark border">Select</span>
        `;
        li.onclick = () => {
            bootstrap.Modal.getInstance($("searchModal"))?.hide();
            els.origDiv.value = loc.parent;
            handleLocationChange(els.origDiv, els.origDist);
            els.origDist.value = loc.name;
            validateJourney();
            $("paribahan-are").scrollIntoView({ behavior: "smooth", block: "start" });
            els.searchInput.value = "";
            els.searchResults.innerHTML = "";
            $("search-placeholder").style.display = "block";
            window.showToast(`Origin set to ${loc.name}. Select destination next.`, false);
        };
        els.searchResults.appendChild(li);
    });
});

const scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? entry.target.classList.add("active") : entry.target.classList.remove("active"));
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach(el => scrollObserver.observe(el));

init();