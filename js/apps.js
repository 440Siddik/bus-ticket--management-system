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
    coupons: { "EID2026": 0.20 } 
};

function getLocalDateString(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const state = {
    isValid: false,
    pricePerSeat: 0,
    selectedSeats: [], 
    bookingHistory: [], 
    appliedCoupon: null, 
    maxSeats: 4,
    get total() { return this.selectedSeats.length * this.pricePerSeat; },
    get discountAmt() { return this.appliedCoupon ? this.total * API.coupons[this.appliedCoupon] : 0; },
    get grandTotal() { return this.total - this.discountAmt; }
};

const mySessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
const lockTimers = {}; 

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

function init() {
    if(!els.origDiv) return; 
    Object.keys(API.divisions).sort().forEach(div => {
        els.origDiv.innerHTML += `<option value="${div}">${div}</option>`;
        els.destDiv.innerHTML += `<option value="${div}">${div}</option>`;
    });
    
    els.date.min = getLocalDateString(0);
    els.date.max = getLocalDateString(10);
    
    els.seats.forEach(seat => {
        const id = seat.innerText.trim();
        if (id.endsWith('1') || id.endsWith('4')) {
            seat.setAttribute('title', 'Window Seat 🪟');
            seat.classList.add('window-seat'); 
        }
    });

    if (window.initializeMap) window.initializeMap();
}

let dbSeatsRef;

function listenToRouteSeats() {
    const orig = els.origDist.value;
    const dest = els.destDist.value;
    const date = els.date.value;
    const time = els.time.value;
    
    if (!orig || !dest || !date || !time) return; 
    
    const pathKey = encodeURIComponent(`${orig}_${dest}_${date}_${time}`).replace(/\./g, '%2E');
    
    try {
        if (typeof firebase !== 'undefined' && firebase.database) {
            const db = firebase.database();
            if (dbSeatsRef) dbSeatsRef.off(); 
            
            dbSeatsRef = db.ref(`journeys/${pathKey}/seats`);
            
            els.seats.forEach(btn => {
                btn.classList.remove('bg-danger', 'text-white', 'bg-secondary', 'pe-none', 'seatColor', 'booked-seat');
                btn.removeAttribute('title');
            });
            
            dbSeatsRef.on('value', (snapshot) => {
                const seatsData = snapshot.val() || {};
                const now = Date.now();
                let bookedOrLockedCount = 0; 
                
                els.seats.forEach(btn => {
                    const seatId = btn.innerText.trim();
                    const seatInfo = seatsData[seatId];
                    
                    btn.classList.remove('bg-danger', 'text-white', 'bg-secondary', 'pe-none', 'booked-seat');
                    btn.removeAttribute('title');
                    
                    if (seatInfo) {
                        if (seatInfo.status === 'booked') {
                            bookedOrLockedCount++;
                            btn.classList.add('pe-none', 'booked-seat');
                            btn.setAttribute('title', 'Sold Out');
                            btn.classList.remove('seatColor'); 
                        } 
                        else if (seatInfo.status === 'locked') {
                            if (now - (seatInfo.lockedAt || 0) > 120000) {
                                // Ignore expired locks
                            } else {
                                bookedOrLockedCount++;
                                if (seatInfo.lockedBy !== mySessionId) {
                                    btn.classList.add('bg-danger', 'text-white', 'pe-none');
                                    btn.setAttribute('title', 'Currently being reviewed by another user');
                                }
                            }
                        }
                    }
                    
                    if (state.selectedSeats.includes(seatId) && (!seatInfo || seatInfo.status !== 'booked')) {
                        btn.classList.add("seatColor");
                    }
                });
                
                const seatCountEl = document.getElementById("seat-count");
                if (seatCountEl) {
                    seatCountEl.innerText = 40 - bookedOrLockedCount;
                }
            });
        }
    } catch (e) {
        console.warn("Firebase Realtime DB not ready yet.", e);
    }
}

function filterAvailableTimes() {
    const selectedDate = els.date.value;
    if (!selectedDate) return;

    const todayStr = getLocalDateString(0);

    if (selectedDate === todayStr) {
        const now = new Date();
        const currentHour = now.getHours() + (now.getMinutes() / 60);

        const timeMap = {
            "07:00 AM": 7.0,
            "10:30 AM": 10.5,
            "02:30 PM": 14.5,
            "08:00 PM": 20.0,
            "11:30 PM": 23.5
        };

        let validExists = false;
        Array.from(els.time.options).forEach(opt => {
            if (!opt.value) return; 
            
            if (timeMap[opt.value] <= currentHour) {
                opt.disabled = true;
                if (els.time.value === opt.value) {
                    els.time.value = ""; 
                }
            } else {
                opt.disabled = false;
                validExists = true;
            }
        });

        if (!validExists) {
            window.showToast("All buses have departed for today. Please select tomorrow.", true);
            els.date.value = "";
            els.time.value = "";
        }
    } else {
        Array.from(els.time.options).forEach(opt => opt.disabled = false);
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
        
        listenToRouteSeats();
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
        
        if (state.selectedSeats.length === 0) {
            state.appliedCoupon = null;
        }
        
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
            window.showToast(`Seat ${seatId} was released due to 2 minutes of inactivity.`, true);
            handleSeatClick(btn, true); 
        }
    }, 120000);
    
    const badge = $("nav-cart-badge");
    badge.classList.remove("animation-pop");
    void badge.offsetWidth; 
    badge.classList.add("animation-pop");

    renderUI();
}

function renderUI() {
    $("ticket-count").innerText = state.selectedSeats.length;
    $("total-price").innerText = state.total;
    $("grand-total").innerText = state.grandTotal;
    
    $("selected-seat-num").innerHTML = state.selectedSeats.map(seat => `
        <div class="seatClass">
            <p class="font-inter text-dark-muted m-0">${seat}</p>
            <p class="font-inter text-dark-muted m-0">${els.busClass.value}</p>
            <p class="font-inter text-dark-muted m-0">${state.pricePerSeat}</p>
        </div>
    `).join("");

    els.applyBtn.disabled = state.selectedSeats.length === 0;
    
    if (state.appliedCoupon && state.selectedSeats.length > 0) {
        $("couponSection").style.display = "none";
        $("discount-price").innerHTML = `
            <div class="d-flex justify-content-between text-success border-bottom pb-2">
                <p class="m-0">Discount Applied (${state.appliedCoupon})</p>
                <p class="m-0">- BDT ${state.discountAmt}</p>
            </div>`;
    } else {
        state.appliedCoupon = null;
        $("couponSection").style.display = "flex";
        $("couponSection").style.opacity = "1";
        $("coupon-code").value = "";
        $("discount-price").innerHTML = "";
    }

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
    state.appliedCoupon = null; 
    
    els.seats.forEach(btn => {
        btn.classList.remove("seatColor");
    });
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

    if (state.selectedSeats.length === 0) {
        if (state.bookingHistory.length > 0) {
            emptyState.classList.add("d-none");
            filledState.classList.add("d-none");
            renderTicketHistory(); 
            badge.classList.add("d-none"); 
        } else {
            emptyState.classList.remove("d-none");
            filledState.classList.add("d-none");
            invoiceState.classList.add("d-none");
            invoiceState.classList.remove("d-flex");
            badge.classList.add("d-none");
        }
    } else {
        emptyState.classList.add("d-none");
        invoiceState.classList.add("d-none");
        invoiceState.classList.remove("d-flex");
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

// 4. EVENT LISTENERS

if(els.origDiv) {
    els.origDiv.addEventListener("change", () => handleLocationChange(els.origDiv, els.origDist));
    els.destDiv.addEventListener("change", () => handleLocationChange(els.destDiv, els.destDist));
    
    els.date.addEventListener("change", () => {
        filterAvailableTimes();
        validateJourney();
    });
    
    [els.origDist, els.destDist, els.busClass, els.time].forEach(el => el.addEventListener("change", validateJourney));
    els.seats.forEach(btn => btn.addEventListener("click", () => handleSeatClick(btn)));
    ["passName", "phoneNumber"].forEach(id => $(id).addEventListener("input", checkFormReady));
    
    els.applyBtn.addEventListener("click", () => {
        const code = $("coupon-code").value.trim().toUpperCase();
        if (!API.coupons[code]) return window.showToast("Invalid or expired coupon code.", true);
        
        state.appliedCoupon = code;
        
        $("couponSection").style.opacity = "0";
        setTimeout(() => {
            renderUI();
            window.showToast("Coupon applied successfully!");
        }, 300);
    });
}

if(els.passengerForm) {
    els.passengerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!els.passengerForm.checkValidity()) return els.passengerForm.classList.add("was-validated");

        const offcanvasEl = $("ticketCartOffcanvas");
        let offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
        if (offcanvas) offcanvas.hide();

        $("payment-total-amount").innerText = state.grandTotal;

        setTimeout(() => {
            new bootstrap.Modal($("paymentModal")).show();
        }, 400); 
    });
}

const processPayment = (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Processing...';
    submitBtn.disabled = true;

    setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        bootstrap.Modal.getInstance($("paymentModal")).hide();
        finalizeBooking();
    }, 1500);
};

if($("paymentFormCard")) $("paymentFormCard").addEventListener("submit", processPayment);
if($("paymentFormBkash")) $("paymentFormBkash").addEventListener("submit", processPayment);
if($("paymentFormNagad")) $("paymentFormNagad").addEventListener("submit", processPayment);

function finalizeBooking() {
    const newTicket = {
        name: $("passName").value,
        phone: $("phoneNumber").value,
        email: $("passEmail").value.trim() || "Not provided",
        route: $("display-route").innerText,
        date: $("display-date").innerText,
        time: $("display-time").innerText,
        total: state.grandTotal,
        seats: [...state.selectedSeats],
        timestamp: new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', month: 'short', day: 'numeric', year: 'numeric' })
    };

    const seatsToBook = [...state.selectedSeats];

    state.selectedSeats = [];
    
    state.bookingHistory.unshift(newTicket);

    if (dbSeatsRef && seatsToBook.length > 0) {
        seatsToBook.forEach(seatId => {
            clearTimeout(lockTimers[seatId]); 
            dbSeatsRef.child(seatId).set({
                status: 'booked',
                bookedBySession: mySessionId, 
                bookedBy: newTicket.name
            });
        });
    }

    if (newTicket.email !== "Not provided") {
        $("success-email-text").innerHTML = `An E-Ticket has been successfully sent to <strong>${newTicket.email}</strong>.`;
        setTimeout(() => window.showToast(`E-Ticket Dispatched to ${newTicket.email} via Secure Server.`, false), 1000);
    } else {
        $("success-email-text").innerText = "No email provided. You can view your ticket history below.";
    }

    state.appliedCoupon = null;
    $("couponSection").style.display = "flex";
    $("couponSection").style.opacity = "1";
    $("coupon-code").value = "";
    $("discount-price").innerHTML = "";
    els.applyBtn.disabled = true;
    els.passengerForm.reset();
    els.passengerForm.classList.remove("was-validated");

    renderTicketHistory();

    setTimeout(() => {
        new bootstrap.Modal($("my_modal_1")).show();
    }, 500);
}

//TICKET HISTORY TABS
function renderTicketHistory() {
    $("cart-empty-state").classList.add("d-none");
    $("cart-filled-state").classList.add("d-none");
    $("cart-invoice-state").classList.remove("d-none");
    $("cart-invoice-state").classList.add("d-flex");

    const container = $("ticket-history-container");
    if (state.bookingHistory.length === 0) return;

    const latestTicket = state.bookingHistory[0];
    const pastTickets = state.bookingHistory.slice(1);

    function buildCard(ticket, ticketNum, isLatest) {
        const badge = isLatest ? `<span class="badge bg-primary-green ms-2">New</span>` : `<span class="badge bg-secondary ms-2">Archived</span>`;
        return `
        <div class="ticket-invoice-card border border-dashed border-2 ${isLatest ? 'border-success' : 'border-secondary'} border-opacity-25 rounded-12 p-4 bg-light-gray position-relative overflow-hidden shadow-sm mb-4">
          <div class="invoice-cutout-left position-absolute bg-white rounded-circle" style="width:30px; height:30px; left:-15px; top:50%; transform:translateY(-50%);"></div>
          <div class="invoice-cutout-right position-absolute bg-white rounded-circle" style="width:30px; height:30px; right:-15px; top:50%; transform:translateY(-50%);"></div>
          
          <h6 class="font-raleway fw-bold text-dark-main mb-3 border-bottom border-dashed pb-2">Ticket #${ticketNum} ${badge}</h6>
          
          <div class="mb-3">
            <p class="font-inter small text-muted m-0">Name</p>
            <p class="font-inter fw-bold text-dark-main m-0 text-truncate">${ticket.name}</p>
          </div>
          
          <div class="d-flex flex-column flex-sm-row justify-content-between mb-3 gap-1">
            <div class="w-100 pe-sm-2">
              <p class="font-inter small text-muted m-0">Phone</p>
              <p class="font-inter fw-bold text-dark-main m-0 text-truncate">${ticket.phone}</p>
            </div>
            <div class="w-100 text-sm-end ps-sm-2 mt-2 mt-sm-0">
              <p class="font-inter small text-muted m-0">Email</p>
              <p class="font-inter fw-bold text-dark-main m-0 text-truncate">${ticket.email}</p>
            </div>
          </div>

          <h6 class="font-raleway fw-bold text-dark-main mb-3 border-bottom border-dashed pb-2 pt-2">Trip Details</h6>
          
          <div class="d-flex flex-column flex-sm-row justify-content-between mb-3 gap-1">
            <div class="w-100 pe-sm-2">
              <p class="font-inter small text-muted m-0">Route</p>
              <p class="font-inter fw-bold text-primary-green m-0 text-break">${ticket.route}</p>
            </div>
            <div class="w-100 text-sm-end ps-sm-2 mt-2 mt-sm-0">
              <p class="font-inter small text-muted m-0">Date & Time</p>
              <p class="font-inter fw-bold text-dark-main m-0"><span>${ticket.date}</span>, <br /><span>${ticket.time}</span></p>
            </div>
          </div>
          
          <div class="d-flex flex-column flex-sm-row justify-content-between mb-3 gap-1">
            <div class="w-100 pe-sm-2">
              <p class="font-inter small text-muted m-0">Seats (${ticket.seats.length})</p>
              <p class="font-inter fw-bold text-dark-main m-0">${ticket.seats.join(", ")}</p>
            </div>
            <div class="w-100 text-sm-end ps-sm-2 mt-2 mt-sm-0">
              <p class="font-inter small text-muted m-0">Amount Paid</p>
              <p class="font-inter fw-bold text-dark-main m-0">BDT <span>${ticket.total}</span></p>
            </div>
          </div>
          <div class="text-center mt-3 pt-3 border-top border-dashed">
             <p class="small text-muted mb-0" style="font-size:10px;">Purchased on: ${ticket.timestamp}</p>
          </div>
        </div>`;
    }

    let pastTicketsHtml = '';
    if (pastTickets.length === 0) {
        pastTicketsHtml = `<p class="text-center text-muted small mt-4">No past bookings found.</p>`;
    } else {
        pastTickets.forEach((ticket, index) => {
            pastTicketsHtml += buildCard(ticket, state.bookingHistory.length - 1 - index, false);
        });
    }

    container.innerHTML = `
        <div class="text-center mb-4 pt-3">
          <div class="d-inline-flex align-items-center justify-content-center bg-success bg-opacity-10 text-success rounded-circle mb-3" style="width: 60px; height: 60px">
            <svg width="30" height="30" fill="currentColor" viewBox="0 0 16 16">
              <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
            </svg>
          </div>
          <h4 class="font-raleway fw-bold text-dark-main">Your E-Tickets</h4>
        </div>

        <ul class="nav nav-pills mb-4 justify-content-center gap-2" id="history-tabs" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link active rounded-pill px-4 py-2 small fw-bold shadow-sm" data-bs-toggle="pill" data-bs-target="#tab-latest" type="button" role="tab">Latest Booking</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link rounded-pill px-4 py-2 small fw-bold shadow-sm" data-bs-toggle="pill" data-bs-target="#tab-past" type="button" role="tab">Past Bookings</button>
          </li>
        </ul>

        <div class="tab-content">
          <div class="tab-pane fade show active" id="tab-latest" role="tabpanel">
             ${buildCard(latestTicket, state.bookingHistory.length, true)}
          </div>
          <div class="tab-pane fade" id="tab-past" role="tabpanel">
             ${pastTicketsHtml}
          </div>
        </div>
    `;
}


// PURE MULTI-PAGE OFFLINE NATIVE PDF ENGINE ===
const downloadTicketBtn = $("downloadTicketBtn");
if (downloadTicketBtn) {
    downloadTicketBtn.addEventListener("click", () => {
        if (!window.jspdf) {
            window.showToast("PDF Engine failed to load. Please check your connection.", true);
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        if (state.bookingHistory.length === 0) return;
        const ticketInfo = state.bookingHistory[0];

        const amountPerTicket = (ticketInfo.total / ticketInfo.seats.length).toFixed(2);
        
        ticketInfo.seats.forEach((seatNum, index) => {
            if (index > 0) doc.addPage();
            
            // Outer dashed border
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.5);
            doc.setLineDashPattern([3, 3], 0);
            doc.rect(20, 30, 170, 200);

            doc.setLineDashPattern([], 0); // Reset dash

            // Title
            doc.setFont("helvetica", "bold");
            doc.setFontSize(28);
            doc.setTextColor(200, 200, 200); 
            doc.text("NEXTRIP DIGITAL TICKET", 105, 55, null, null, "center");

            // Details
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(14);
            
            doc.setFont("helvetica", "bold");
            doc.text("Passenger:", 35, 90);
            doc.setFont("helvetica", "normal");
            doc.text(ticketInfo.name, 80, 90);

            doc.setDrawColor(220, 220, 220);
            doc.line(35, 95, 175, 95);

            doc.setFont("helvetica", "bold");
            doc.text("Phone:", 35, 105);
            doc.setFont("helvetica", "normal");
            doc.text(ticketInfo.phone, 80, 105);
            
            doc.line(35, 110, 175, 110);

            doc.setFont("helvetica", "bold");
            doc.text("Route:", 35, 120);
            doc.setFont("helvetica", "normal");
            doc.text(ticketInfo.route, 80, 120);

            doc.line(35, 125, 175, 125);

            doc.setFont("helvetica", "bold");
            doc.text("Date & Time:", 35, 135);
            doc.setFont("helvetica", "normal");
            doc.text(`${ticketInfo.date} at ${ticketInfo.time}`, 80, 135);

            doc.line(35, 140, 175, 140);

            // Seat Number Output
            doc.setFont("helvetica", "bold");
            doc.setFontSize(30);
            doc.setTextColor(150, 150, 150);
            doc.text(`Seat: ${seatNum}`, 105, 170, null, null, "center");

            // Amount Paid
            doc.setFontSize(20);
            doc.setTextColor(29, 209, 0); 
            doc.text(`Amount Paid: BDT ${amountPerTicket}`, 105, 195, null, null, "center");

            // Footer Note
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Ticket ${index + 1} of ${ticketInfo.seats.length} - Scan code upon boarding`, 105, 220, null, null, "center");
        });

        // Natively prompts physical download of PDF
        doc.save(`NexTrip_Tickets_${ticketInfo.name.replace(/\s+/g, '_')}.pdf`);
        window.showToast("E-Tickets downloaded securely!", false);
    });
}

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
            updateMiniCart(); 
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
            state.appliedCoupon = null;
            $("ticket-count").innerText = 0;
            $("total-price").innerText = 0;
            $("grand-total").innerText = 0;
            $("selected-seat-num").innerHTML = "";
            
            listenToRouteSeats(); 
        }
    });
}

window.addEventListener("userLoggedOut", () => {
    resetSeats();
    els.passengerForm.reset();
    els.passengerForm.classList.remove("was-validated");
    state.bookingHistory = []; 
    
    $("cart-empty-state").classList.remove("d-none");
    $("cart-filled-state").classList.add("d-none");
    $("cart-invoice-state").classList.add("d-none");
    $("cart-invoice-state").classList.remove("d-flex");
    $("nav-cart-badge").classList.add("d-none");
});

const searchIndex = [];
for (const [div, dists] of Object.entries(API.divisions)) {
    searchIndex.push({ name: div, type: "Division", parent: div });
    dists.forEach(dist => searchIndex.push({ name: dist, type: "District", parent: div }));
}

if(els.searchInput) {
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
}

const scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? entry.target.classList.add("active") : entry.target.classList.remove("active"));
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach(el => scrollObserver.observe(el));

init();