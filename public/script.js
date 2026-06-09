//script.js - main JavaScript file for Lamio e-commerce frontend
const API_URL = "/api";
let allProducts = [];
let cart = [];
let userAddresses = [];
let currentCategory = "all";
let selectedPayment = null;
let renderRequestId = 0;
let selectedReviewRating = 0;

const el = (id) => document.getElementById(id);
const getToken = () => localStorage.getItem("lamioToken");
const isUserAdmin = () => localStorage.getItem("lamioIsAdmin") === "true";
const normalizePhone = (v) => String(v || "").replace(/\s+/g, "").replace(/^\+91/, "");
const getAuthHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });

function closeAllModals() {
    document.querySelectorAll(".modal").forEach((m) => {
        m.style.display = "none";
    });
}

function showToast(message, type = "info") {
    const box = el("toastContainer");
    if (!box) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    box.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 50);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function setSection(mode) {
    ["heroSection", "collection", "adminDashboard", "userDashboard", "ordersPage"].forEach((id) => {
        const node = el(id);
        if (!node) return;
        const visible = mode === "home" ? id === "heroSection" || id === "collection" : id === mode;
        node.style.display = visible ? (id === "heroSection" || id === "collection" ? "" : "block") : "none";
    });
}

function updateNavAuthState() {
    const login = el("navLogin");
    const orders = el("navOrdersItem");
    const account = el("navAccount");
    const admin = el("navAdminDashboard");
    const cartItem = el("navCartItem");
    if (!login || !orders || !account || !admin) return;

    if (!getToken()) {
        login.style.display = "list-item";
        orders.style.display = "none";
        account.style.display = "none";
        admin.style.display = "none";
        if (cartItem) cartItem.style.display = "list-item";
        return;
    }

    login.style.display = "none";
    if (isUserAdmin()) {
        orders.style.display = "list-item";
        account.style.display = "none";
        admin.style.display = "list-item";
        if (cartItem) cartItem.style.display = "none";
        return;
    }

    orders.style.display = "none";
    admin.style.display = "none";
    if (cartItem) cartItem.style.display = "list-item";
    account.style.display = "list-item";
    account.innerHTML = `<a href="#" onclick="openUserDashboard(); return false;">${localStorage.getItem("lamioCurrentUserName") || "My Account"}</a>`;
}

function openWelcomeModal() {
    closeAllModals();
    if (el("welcomeModal")) el("welcomeModal").style.display = "flex";
}

function showHome() {
    setSection("home");
    closeAllModals();
    updateNavAuthState();
    renderProducts();
}

function showAdminDashboard() {
    setSection("adminDashboard");
    updateNavAuthState();
    loadAdminProducts();
    window.scrollTo(0, 0);
}

function openOrdersPage() {
    if (!getToken()) return openWelcomeModal();
    setSection("ordersPage");
    loadOrdersPage();
    window.scrollTo(0, 0);
}

async function openUserDashboard() {
    if (!getToken()) return openWelcomeModal();
    setSection("userDashboard");
    closeAllModals();
    populateUserProfileFromStorage();
    await fetchAddresses();
    renderProfileAddresses();
    switchUDashTab("profile");
    updateNavAuthState();
    window.scrollTo(0, 0);
}

function populateUserProfileFromStorage() {
    const name = localStorage.getItem("lamioCurrentUserName") || "";
    const email = localStorage.getItem("lamioCurrentUser") || "";
    const phone = localStorage.getItem("lamioCurrentUserPhone") || "";
    if (el("profileName")) el("profileName").textContent = name || "Your Name";
    if (el("profileEmail")) el("profileEmail").textContent = email;
    if (el("profilePhone")) el("profilePhone").textContent = phone;
    if (el("profileEditName")) el("profileEditName").value = name;
    if (el("profileEditPhone")) el("profileEditPhone").value = phone;
}

function openProfileEditModal() {
    const node = el("profileEditName");
    if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.focus();
    }
}

function switchUDashTab(tab) {
    const profile = el("udash-profile");
    const orders = el("udash-orders");
    if (!profile || !orders) return;
    profile.style.display = tab === "orders" ? "none" : "block";
    orders.style.display = tab === "orders" ? "block" : "none";
    el("tab-profile")?.classList.toggle("active", tab !== "orders");
    el("tab-orders")?.classList.toggle("active", tab === "orders");
    if (tab === "orders") loadOrders();
}

function persistUserSession(data) {
    localStorage.setItem("lamioToken", data.token);
    if (data.user?.id != null) localStorage.setItem("lamioCurrentUserId", String(data.user.id));
    if (data.user?.email != null) localStorage.setItem("lamioCurrentUser", String(data.user.email));
    if (data.user?.name != null) localStorage.setItem("lamioCurrentUserName", String(data.user.name));
    if (data.user?.phone != null) localStorage.setItem("lamioCurrentUserPhone", String(data.user.phone));
    if (data.isAdmin) localStorage.setItem("lamioIsAdmin", "true");
    else localStorage.removeItem("lamioIsAdmin");
}

const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validatePhone = (v) => /^(\+91\s?)?\d{10}$/.test(String(v || "").replace(/\s/g, ""));

async function handleUserAuth(mode) {
    const email = el(mode === "signin" ? "siEmail" : "regEmail")?.value.trim() || "";
    const password = el(mode === "signin" ? "siPassword" : "regPassword")?.value || "";
    if (!email || !password) return showToast("Enter email and password", "error");
    if (!validateEmail(email)) return showToast("Invalid email format", "error");

    const body = { email, password };
    if (mode === "register") {
        const name = el("regName")?.value.trim() || "";
        const phone = normalizePhone(el("regPhone")?.value || "");
        if (!name) return showToast("Enter your name", "error");
        if (!validatePhone(phone)) return showToast("Enter a valid phone number", "error");
        body.name = name;
        body.phone = phone;
    }

    try {
        const res = await fetch(`${API_URL}/auth/${mode === "signin" ? "login" : "register"}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok || !data.success || !data.token) return showToast(data.error || "Authentication failed", "error");
        persistUserSession(data);
        populateUserProfileFromStorage();
        closeAllModals();
        if (data.isAdmin) {
            showAdminDashboard();
            showToast("Welcome, admin", "success");
        } else {
            updateNavAuthState();
            showHome();
            showToast(mode === "register" ? "Account created" : "Welcome back", "success");
        }
    } catch (err) {
        console.error(err);
        showToast("Network error. Is the server running?", "error");
    }
}

function switchAuthTab(tab) {
    const signIn = document.getElementById("authSignInForm");
    const register = document.getElementById("authRegisterForm");

    const tabSignIn = document.getElementById("tabSignIn");
    const tabRegister = document.getElementById("tabRegister");

    if (tab === "signin") {
        signIn.style.display = "block";
        register.style.display = "none";

        tabSignIn.classList.add("active");
        tabRegister.classList.remove("active");
    } else {
        signIn.style.display = "none";
        register.style.display = "block";

        tabRegister.classList.add("active");
        tabSignIn.classList.remove("active");
    }
}

function initPasswordToggles() {
    document.querySelectorAll(".toggle-password").forEach((toggle) => {
        toggle.addEventListener("click", function () {
            const inputId = this.getAttribute("data-toggle");
            const input = document.getElementById(inputId);

            if (!input) return;

            if (input.type === "password") {
                input.type = "text";
                this.classList.remove("fa-eye");
                this.classList.add("fa-eye-slash");
            } else {
                input.type = "password";
                this.classList.remove("fa-eye-slash");
                this.classList.add("fa-eye");
            }
        });
    });
}

const statusBadgeClass = (v) => {
    const s = String(v || "").toLowerCase();
    if (s.includes("deliver")) return "status-delivered";
    if (s.includes("ship") || s.includes("out")) return "status-out";
    return "status-preparing";
};

const productIsAvailable = (p) => Number(p.stock || 0) > 0 && !String(p.status || "").toLowerCase().includes("out");
const cartAllowsCod = () => cart.every((item) => item.cod_enabled);

async function getProducts() {
    try {
        const res = await fetch(`${API_URL}/products`);
        const data = await res.json();
        allProducts = Array.isArray(data) ? data : [];
    } catch (err) {
        console.error(err);
        allProducts = [];
        showToast("Could not load products", "error");
    }
    renderProducts();
}

async function loadProductPage(productId){
    if(!productId) return;
    try{
        const res = await fetch(`${API_URL}/products/${productId}`);
        const product = await res.json();
        renderProductPage(product);
        await loadRelatedProducts(productId);
        await loadReviews(productId);
    }
    catch(err){console.error(err);
        showToast(
            "Could not load product",
            "error"
        );
    }
}

function renderProductPage(product) {

    const available =
        product.status !== "Out of Stock";

    el("productPage").innerHTML = `

        <div style="max-width:800px;margin:40px auto;text-align:center;">
            <div class="product-search-area">
            
                <div class="product-search-wrap">
            
                    <input
                        type="text"
                        id="catalogSearch"
                        placeholder="Search our collection..."
                        oninput="handleProductSearch()">
            
                    <span class="product-search-icon">🔍</span>
            
                </div>
            </div>
        </div>

        <div id="productSearchGrid"></div>

        <div id="productContent">
        
            <div class="product-top">

                <div class="product-left">
                    <img
                        src="${product.image_webp}"
                        class="product-large-image">
                </div>
    
                <div class="product-right">
    
                    <h1 class="product-title">
                        ${product.name}
                    </h1>
    
                    <h2 class="product-price">
                        INR ${product.price}
                    </h2>
    
                    <p class="${
                        available
                            ? 'stock-green'
                            : 'stock-red'
                    }">
                        ${
                            available
                                ? 'Available'
                                : 'Out Of Stock'
                        }
                    </p>
    
                    <p>
                        ${
                            product.cod_enabled
                                ? 'Cash on Delivery available'
                                : 'Cash on Delivery unavailable'
                        }
                    </p>
    
                    <p>
                        Shipping charges may be applicable
                    </p>
    
                    <div class="product-buttons">
    
                        <button
                            class="btn-primary"
                            onclick="addToCart(${product.id})">
                            Add To Cart
                        </button>
    
                        <button
                            class="btn-primary buy-btn"
                            onclick="buyNow(${product.id})">
                            Buy Now
                        </button>
    
                    </div>
    
                    <p>
                        ${product.description || ""}
                    </p>
    
                </div>
            
            </div>
        
        </div>        
        <div class="product-top"></div>

        <div class="product-tabs">

            <button
                class="tab-btn active"
                onclick="showProductTab('reviews')">

                Reviews & Ratings

            </button>

            <button
                class="tab-btn"
                onclick="showProductTab('related', this)">

                Related Products

            </button>

        </div>

        <div
            id="reviewsTab"
            class="tab-section">
        </div>

        <div
            id="relatedTab"
            class="tab-section"
            style="display:none;">
        </div>
    `;
}

async function handleProductSearch(){

    const grid = el("productSearchGrid");

    const q = el("catalogSearch")
        .value
        .trim()
        .toLowerCase();

    if(!q){

        grid.style.display = "none";
        grid.innerHTML = "";

        el("productContent").style.display = "block";

        return;
    }

    const list = allProducts.filter(
        p =>
            (p.name || "")
            .toLowerCase()
            .includes(q)
    );

    grid.style.display = "grid";

    el("productContent").style.display = "none";

    grid.innerHTML = list.map(p => `
        <div
            class="card"
            onclick="openProduct(${p.id})">

            <img
                src="${p.image_webp || './logo.png'}"
                class="product-image">

            <h3>
                ${(p.name || "").toUpperCase()}
            </h3>

            <p>INR ${p.price}</p>

            <small>
                ${
                    p.cod_enabled
                        ? "COD available"
                        : "Online payment only"
                }
            </small>

        </div>
    `).join("");
}

async function buyNow(productId){

    const product =
        allProducts.find(
            p => p.id == productId
        );

    if(!product){
        return;
    }

    if(!productIsAvailable(product)){
        return showToast(
            "This product is currently unavailable",
            "error"
        );
    }

    cart = [{
        ...product,
        qty:1
    }];

    saveCart();
    updateCartCountUI();
    renderCart();

    await startCheckout();
}

async function loadRelatedProducts(productId) {

    const res =
        await fetch(
            `${API_URL}/products/${productId}/related`
        );

    const products =
        await res.json();

    el("relatedTab").innerHTML = `
        <div class="related-scroll">

            ${products.map(p => `
                <div
                    class="card"
                    onclick="openProduct(${p.id})">

                    <img src="${p.image_webp}">

                    <h3>
                        ${p.name.toUpperCase()}
                    </h3>

                    <p>
                        INR ${p.price}
                    </p>

                    <small>
                        ${
                            p.cod_enabled
                                ? "COD available"
                                : "Online payment only"
                        }
                    </small>

                    <button
                        onclick="
                            event.stopPropagation();
                            addToCart(${p.id});
                        ">
                        Add to Cart
                    </button>

                </div>
            `).join("")}

        </div>
    `;
}

async function loadReviews(productId){

    const res =
        await fetch(
            `${API_URL}/products/${productId}/reviews`
        );

    const reviews =
        await res.json();

    
    const currentUser =
    localStorage.getItem(
        "lamioCurrentUserName"
    ) || "";
    
    const alreadyReviewed =
        reviews.some(
            r =>
                r.username === currentUser
        );

    const loggedIn = !!getToken();

    let html = "";
    
    if(loggedIn && !alreadyReviewed){
    
        html += `
            <div class="review-form">
    
                <h3>Write a Review</h3>
    
                <div class="star-picker">
                    <span onclick="setReviewRating(1)">★</span>
                    <span onclick="setReviewRating(2)">★</span>
                    <span onclick="setReviewRating(3)">★</span>
                    <span onclick="setReviewRating(4)">★</span>
                    <span onclick="setReviewRating(5)">★</span>
                </div>
    
                <textarea
                    id="reviewText"
                    placeholder="Share your experience..."
                    maxlength="500">
                </textarea>
    
                <button
                    class="btn-primary"
                    onclick="submitReview()">
                    Submit Review
                </button>
    
            </div>
        `;
    
    } else if(alreadyReviewed){

        html += `
            <div class="review-login-note">
                You have already reviewed this product.
            </div>
        `;
    } else {
    
        html += `
            <div class="review-login-note">
                Please sign in to write a review.
            </div>
        `;
    }

    if(!reviews.length){

        html += `
            <p class="no-reviews">
                No reviews yet
            </p>
        `;

    } else {

        html += reviews.map(r => `
            <div class="review-card">

                <div class="review-stars">
                    ${"★".repeat(r.rating)}
                </div>

                <b>${r.username}</b>

                <p>${r.review}</p>

            </div>
        `).join("");
    }

    el("reviewsTab").innerHTML = html;
}

function showProductTab(tab){
    el("reviewsTab").style.display=tab==="reviews"?"block":"none";
    el("relatedTab").style.display=tab==="related"?"block":"none";

    document.querySelectorAll(".tab-btn")
        .forEach(btn=>btn.classList.remove("active"));

    if(tab==="reviews")
        document.querySelectorAll(".tab-btn")[0].classList.add("active");

    if(tab==="related")
        document.querySelectorAll(".tab-btn")[1].classList.add("active");
}

function setReviewRating(rating){

    selectedReviewRating = rating;

    document
        .querySelectorAll(".star-picker span")
        .forEach((star,index)=>{

            star.classList.toggle(
                "active",
                index < rating
            );

        });
}

async function submitReview(){

    if(!getToken()){

        showToast(
            "Please sign in to review",
            "error"
        );

        openWelcomeModal();

        return;
    }

    const params =
        new URLSearchParams(location.search);

    const productId =
        params.get("id");

    const review =
        el("reviewText").value.trim();

    if(!selectedReviewRating){
        return showToast(
            "Select a rating",
            "error"
        );
    }

    if(!review){
        return showToast(
            "Write a review",
            "error"
        );
    }

    try{

        const res = await fetch(
            `${API_URL}/products/${productId}/reviews`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    username:
                        localStorage.getItem(
                            "lamioCurrentUserName"
                        ) || "Anonymous",
                    rating:
                        selectedReviewRating,
                    review
                })
            }
        );

        const data =
            await res.json();

        if(!data.success){
            throw new Error(
                data.error
            );
        }

        el("reviewText").value = "";
        selectedReviewRating = 0;

        document
            .querySelectorAll(
                ".star-picker span"
            )
            .forEach(
                star =>
                    star.classList.remove(
                        "active"
                    )
            );

        loadReviews(productId);

        showToast(
            "Review submitted",
            "success"
        );

    }
    catch(err){

        console.error(err);

        showToast(
            "Could not submit review",
            "error"
        );
    }
}

function setCategoryFilter(category) {
    currentCategory = category;
    document.querySelectorAll(".filter-tab").forEach((t) => t.classList.toggle("active", t.dataset.category === category));
    renderProducts();
}

function handleFilterChange() {
    renderProducts();
}

async function renderProducts() {
    const grid = el("productGrid");
    if (!grid) return;
    const requestId = ++renderRequestId;
    grid.innerHTML = Array(8)
        .fill("")
        .map(() => `
            <div class="card skeleton-card">
                <div class="skeleton-img"></div>
                <div class="skeleton-text short"></div>
                <div class="skeleton-text tiny"></div>
                <div class="skeleton-btn"></div>
            </div>
        `)
        .join("");

    const q = ( el("catalogSearch")?.value || "" ).trim();
    try {const url =
            `${API_URL}/catalogsearch` +
            `?q=${encodeURIComponent(q)}` +
            `&category=${encodeURIComponent(currentCategory)}`;
        const res = await fetch(url);
        if (!res.ok) {throw new Error("Failed to fetch products");}
        const list = await res.json();
        if (requestId !== renderRequestId) {
            return;
        }
        allProducts = list;
        if (!list.length) {
            grid.innerHTML = `
                <p style="text-align:center;">
                    No products found.
                </p>
            `;
            return;
        }
        grid.innerHTML = "";
        const imageQueue = [];
        for (const p of list) {
            const available = productIsAvailable(p);
            const note = available
                ? (
                    p.cod_enabled
                        ? "COD available"
                        : "Online payment only"
                )
                : "Out of stock";

            const label = available
                ? "Add to Cart"
                : "Unavailable";

            const card = document.createElement("div");
            card.className = "card";
            card.onclick = () => openProduct(p.id);

            card.innerHTML = `
                <img
                    src="./logo.png"
                    class="product-image"
                    alt="${p.name || "Lamio product"}"
                >

                <h3>${(p.name || "").toUpperCase()}</h3>
                <p>INR ${p.price}</p>

                <small style="
                    display:block;
                    margin-bottom:10px;
                    color:${available ? "#666" : "#c0392b"};
                ">
                    ${note}
                </small>

                <button
                    type="button"
                    onclick="addToCart(${p.id})"
                    ${available ? "" : "disabled"}>
                    ${label}
                </button>
            `;

            grid.appendChild(card);

            imageQueue.push({
                img: card.querySelector("img"),
                src:
                    p.image_webp ||
                    p.image ||
                    p.image_url ||
                    "./logo.png"
            });
        }

        for (const item of imageQueue) {

            if (requestId !== renderRequestId) {
                return;
            }

            await loadImageSequentially(
                item.img,
                item.src
            );
        }

    } catch (err) {
        console.error(err);

        grid.innerHTML = `
            <p style="text-align:center;color:red;">
                Failed to load products
            </p>
        `;
    }
}

function openProduct(id){

    showHome();

    el("heroSection").style.display="none";
    el("collection").style.display="none";
    el("ordersPage").style.display="none";
    el("userDashboard").style.display="none";
    el("adminDashboard").style.display="none";

    el("productPage").style.display="block";

    loadProductPage(id);

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });
}

function loadImageSequentially(imgEl, src) {
    return new Promise((resolve) => {
        const tempImg = new Image();

        tempImg.onload = () => {
            imgEl.src = src;
            resolve();
        };

        tempImg.onerror = () => {
            console.warn(
                "Image failed to load:",
                src
            );
            resolve();
        };

        tempImg.src = src;
    });
}

function updateCartCountUI() {
    if (el("cartCount")) el("cartCount").textContent = String(cart.reduce((s, c) => s + Number(c.qty || 0), 0));
}

function saveCart() {
    localStorage.setItem("lamioCart", JSON.stringify(cart));
}

function loadCart() {
    try {
        cart = JSON.parse(localStorage.getItem("lamioCart") || "[]");
    } catch {
        cart = [];
    }
    updateCartCountUI();
}

function addToCart(id) {
    const product = allProducts.find((p) => p.id === id);
    if (!product) return;
    if (!productIsAvailable(product)) return showToast("This product is currently unavailable", "error");
    const existing = cart.find((item) => item.id === id);
    if (existing) existing.qty += 1;
    else cart.push({ ...product, qty: 1 });
    saveCart();
    updateCartCountUI();
    renderCart();
    showToast("Added to cart", "success");
}

function removeFromCart(id) {
    cart = cart.filter((item) => item.id !== id);
    saveCart();
    updateCartCountUI();
    renderCart();
}

function renderCart() {
    const list = el("cartItemsList");
    const total = el("cartTotalDisplay");
    if (!list || !total) return;
    if (!cart.length) {
        list.innerHTML = "<p style='text-align:center;color:#666;'>Your cart is empty.</p>";
        total.textContent = "Total: INR 0";
        return;
    }
    list.innerHTML = cart.map((item) => `<div style="display:flex;
                justify-content:space-between;
                gap:12px;
                padding:12px 0;
                border-bottom:1px solid #eee;"><div>
                <strong>${(item.name || "").toUpperCase()}</strong><br>
                <small>Qty: ${item.qty}</small><br>
                <small>${item.cod_enabled ? "COD available" : "Online payment only"}</small>
                </div>
                <div style="text-align:right;"><strong>INR ${item.price * item.qty}</strong>
                <br><button type="button" onclick="removeFromCart(${item.id})" style="margin-top:8px;">Remove</button></div></div>`).join("");
    total.textContent = `Total: INR ${cart.reduce((sum, item) => sum + item.price * item.qty, 0)}`;
}

function openCartModal() {
    closeAllModals();
    if (el("cartModal")) el("cartModal").style.display = "flex";
    renderCart();
}

async function fetchAddresses() {
    if (!getToken()) {
        userAddresses = [];
        return;
    }
    try {
        const res = await fetch(`${API_URL}/address`, { headers: getAuthHeaders() });
        const data = await res.json();
        userAddresses = Array.isArray(data) ? data : [];
    } catch (err) {
        console.error(err);
        userAddresses = [];
    }
}

const getSelectedAddress = () => userAddresses.find((a) => a.id === Number(localStorage.getItem("lamioAddressId"))) || null;

function ensureSelectedAddress() {
    const selected = getSelectedAddress();
    if (selected || !userAddresses.length) return selected;

    const fallback = userAddresses[0];
    localStorage.setItem("lamioAddressId", String(fallback.id));
    return fallback;
}

function renderProfileAddresses() {
    const box = el("profileAddressList");
    if (!box) return;
    if (!userAddresses.length) {
        box.innerHTML = "<p style='color:#888;'>No saved addresses</p>";
        return;
    }
    const selectedId = Number(localStorage.getItem("lamioAddressId"));
    box.innerHTML = userAddresses.map((a) => `<div style="border:1px solid #ddd;padding:12px;border-radius:8px;margin-bottom:10px;background:${selectedId === a.id ? "#fdf5f5" : "#fff"};">
    <strong>${a.full_name}</strong><br>
    <small>${a.phone}</small><br>
    <small>${a.address_line}</small><br>
    <small>${a.city} - ${a.pincode}</small><br>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
    <button onclick="selectAddress(${a.id})" class="btn-primary">Use</button>
    <button onclick="openAddressModalById(${a.id})" class="btn-primary" style="background:#555;">Edit</button>
    <button onclick="deleteAddress(${a.id})" class="btn-primary" style="background:#c0392b;">Delete</button></div></div>`).join("");
}

function renderSavedAddresses() {
    const box = el("savedAddresses");
    if (!box) return;
    if (!userAddresses.length) {
        box.innerHTML = "<p>No saved addresses</p>";
        return;
    }
    const selectedId = ensureSelectedAddress()?.id;
    box.innerHTML = userAddresses.map((a) => `<div class="address-card ${selectedId === a.id ? "selected" : ""}" onclick="selectAddress(${a.id})"><strong>${a.full_name}</strong><br><small>${a.address_line}, ${a.city}</small><br><small>${a.phone}</small></div>`).join("");
}

async function selectAddress(id) {
    localStorage.setItem("lamioAddressId", String(id));
    renderProfileAddresses();
    renderSavedAddresses();
    showToast("Address selected", "success");
}

function openAddressModalById(id) {
    const address = userAddresses.find((a) => a.id === id);
    if (address) openAddressModal("edit", address);
}

function openAddressModal(mode = "add", address = null) {
    if (el("addressModal")) el("addressModal").style.display = "flex";
    if (el("addressModalTitle")) el("addressModalTitle").textContent = mode === "edit" ? "Edit Address" : "Add Address";
    if (el("addrEditId")) el("addrEditId").value = address ? String(address.id) : "";
    if (el("addrLine")) el("addrLine").value = address?.address_line || "";
    if (el("addrLandmark")) el("addrLandmark").value = address?.landmark || "";
    if (el("addrCity")) el("addrCity").value = address?.city || "";
    if (el("addrPincode")) el("addrPincode").value = address?.pincode || "";
}

async function saveAddress() {
    const addressId = el("addrEditId")?.value || "";
    const body = {
        full_name: localStorage.getItem("lamioCurrentUserName") || "",
        phone: localStorage.getItem("lamioCurrentUserPhone") || "",
        address_line: el("addrLine")?.value.trim() || "",
        landmark: el("addrLandmark")?.value.trim() || "",
        city: el("addrCity")?.value.trim() || "",
        state: "",
        pincode: el("addrPincode")?.value.trim() || ""
    };
    if (!body.full_name || !body.phone || !body.address_line || !body.city || !body.pincode) return showToast("Fill all required address fields", "error");
    try {
        const res = await fetch(`${API_URL}/address${addressId ? `/${addressId}` : ""}`, {
            method: addressId ? "PUT" : "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok || !data.success) return showToast(data.error || "Could not save address", "error");
        localStorage.setItem("lamioAddressId", String(data.addressId || addressId));
        closeAllModals();
        await fetchAddresses();
        renderProfileAddresses();
        renderSavedAddresses();
        showToast(addressId ? "Address updated" : "Address added", "success");
    } catch (err) {
        console.error(err);
        showToast("Could not save address", "error");
    }
}

async function deleteAddress(id) {
    if (!confirm("Delete this address?")) return;
    try {
        const res = await fetch(`${API_URL}/address/${id}`, { method: "DELETE", headers: getAuthHeaders() });
        const data = await res.json();
        if (!res.ok || !data.success) return showToast(data.error || "Delete failed", "error");
        if (Number(localStorage.getItem("lamioAddressId")) === id) localStorage.removeItem("lamioAddressId");
        await fetchAddresses();
        renderProfileAddresses();
        renderSavedAddresses();
        showToast("Address deleted", "success");
    } catch (err) {
        console.error(err);
        showToast("Delete failed", "error");
    }
}

function setDeliveryEstimate() {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    if (el("deliveryEstimate")) el("deliveryEstimate").textContent = d.toDateString();
}

async function startCheckout() {
    if (!cart.length) return showToast("Your cart is empty", "error");
    if (!getToken()) {
        showToast("Please sign in to checkout", "error");
        return openWelcomeModal();
    }
    selectedPayment = null;
    await fetchAddresses();
    ensureSelectedAddress();
    closeAllModals();
    if (el("checkoutModal")) el("checkoutModal").style.display = "flex";
    if (el("checkoutStep1")) el("checkoutStep1").style.display = "block";
    if (el("checkoutStep2")) el("checkoutStep2").style.display = "none";
    updatePlaceOrderButton();
    updatePaymentOptionsUI();
    renderSavedAddresses();
    setDeliveryEstimate();
}

function goToPaymentStep() {
    if (!getSelectedAddress()) return showToast("Select a delivery address first", "error");
    if (el("checkoutStep1")) el("checkoutStep1").style.display = "none";
    if (el("checkoutStep2")) el("checkoutStep2").style.display = "block";
}

function goBackToAddress() {
    if (el("checkoutStep1")) el("checkoutStep1").style.display = "block";
    if (el("checkoutStep2")) el("checkoutStep2").style.display = "none";
}

function updatePaymentOptionsUI() {
    document.querySelectorAll(".pm-tile").forEach((tile) => {
        const method = tile.getAttribute("data-payment-method") || "";
        const disabled = method === "COD" && !cartAllowsCod();
        tile.classList.toggle("disabled", disabled);
        tile.classList.toggle("selected", !disabled && method === selectedPayment);
        tile.setAttribute("aria-disabled", disabled ? "true" : "false");
        tile.title = disabled ? "One or more items require online payment" : "";
    });
}

function updatePlaceOrderButton() {
    const button = el("placeOrderBtn");
    if (!button) return;
    if (selectedPayment === "ONLINE") {
        button.textContent = "Pay Now";
        return;
    }
    if (selectedPayment === "COD") {
        button.textContent = "Place COD Order";
        return;
    }
    button.textContent = "Place Order";
}

function formatOrderAddress(order) {
    const parts = [
        order.full_name,
        order.phone,
        order.address_line,
        order.landmark,
        order.city,
        order.state,
        order.pincode
    ].filter(Boolean);
    return parts.join(", ");
}

function renderAdminStatusControl(order) {
    const current = String(order.status || "pending").toLowerCase();
    const options = [
        ["pending", "Pending"],
        ["packing", "Packing"],
        ["out for delivery", "Out for Delivery"],
        ["delivered", "Delivered"]
    ];

    return `<select class="admin-status-select" onchange="updateOrderStatus(${order.id}, this.value)">
        ${options.map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("")}
    </select>`;
}

function selectPayment(method) {
    if (method === "COD" && !cartAllowsCod()) return showToast("Some items in your cart require online payment", "error");
    selectedPayment = method;
    updatePaymentOptionsUI();
    updatePlaceOrderButton();
    showToast(`${method} selected`, "success");
}

const buildCheckoutItems = () => cart.map((item) => ({ product_id: item.id, quantity: item.qty }));
const paymentLabel = (m) => {
    const method = String(m || "").toUpperCase();
    if (method === "COD") return "COD";
    if (method === "ONLINE") return "ONLINE";
    return method || "-";
};

async function placeOrder() {
    const button = el("placeOrderBtn");
    if (!button) return;

    const address = getSelectedAddress();
    if (!address) return showToast("Select an address", "error");
    if (!selectedPayment) return showToast("Select a payment method", "error");
    
    if (button.disabled) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Processing...";

    try {
        const res = await fetch(`${API_URL}/checkout`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                address_id: address.id,
                payment_method: selectedPayment,
                items: buildCheckoutItems()
            })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error || "Checkout failed");
        }

        if (selectedPayment === "COD") {
            const finalCart = [...cart];
            cart = [];
            saveCart();
            updateCartCountUI();
            renderCart();

            showReceipt(data.orderId, finalCart, address, "COD");
            return;
        }

        startRazorpayCheckout(data, address);

    } catch (err) {
        console.error(err);
        showToast(err.message || "Checkout failed", "error");

    } finally {
        if (selectedPayment !== "ONLINE") {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

function startRazorpayCheckout(data, address) {
    const button = el("placeOrderBtn");

    const rzp = new Razorpay({
        key: data.razorpayKeyId,
        amount: data.razorpayOrder.amount,
        currency: data.razorpayOrder.currency,
        name: "Lamio",
        order_id: data.razorpayOrder.id,

        handler(response) {
            verifyAndCompletePayment(
                response,
                data.checkoutToken,
                data.razorpayOrder.id,
                address
            );
        }
    });

    rzp.on("payment.failed", () => {
        if (button) {
            button.disabled = false;
            button.textContent = "Pay Now";
        }
        showToast("Payment failed. Try again.", "error");
    });

    rzp.open();
}

async function verifyAndCompletePayment(payment, checkoutToken, razorpayOrderId, address) {
    const button = el("placeOrderBtn");

    try {
        if (button) button.textContent = "Verifying payment...";

        const res = await fetch(`${API_URL}/verify-payment`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                razorpay_order_id: razorpayOrderId,
                razorpay_payment_id: payment.razorpay_payment_id,
                razorpay_signature: payment.razorpay_signature,
                checkout_token: checkoutToken
            })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error || "Payment verification failed");
        }

        const finalCart = [...cart];
        cart = [];
        saveCart();
        updateCartCountUI();
        renderCart();

        showReceipt(data.orderId, finalCart, address, "ONLINE");

    } catch (err) {
        console.error(err);
        showToast("Payment verification failed", "error");

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Pay Now";
        }
    }
}

function showReceipt(orderId, items, address, method) {
    closeAllModals();
    if (el("receiptModal")) el("receiptModal").style.display = "flex";
    if (el("receiptOrderId")) el("receiptOrderId").textContent = `#${orderId}`;
    if (el("receiptDate")) el("receiptDate").textContent = new Date().toLocaleDateString();
    if (el("receiptPaymentMethod")) el("receiptPaymentMethod").textContent = paymentLabel(method);
    if (el("receiptTotal")) el("receiptTotal").textContent = `INR ${items.reduce((s, i) => s + i.price * i.qty, 0)}`;
    const est = new Date();
    est.setDate(est.getDate() + 3);
    if (el("receiptDelivery")) el("receiptDelivery").textContent = est.toLocaleDateString();
    if (el("receiptAddress")) el("receiptAddress").textContent = address ? `${address.address_line}, ${address.city} - ${address.pincode}` : "Saved address";
    if (el("receiptItems")) el("receiptItems").innerHTML = items.map((i) => `<div class="receipt-row"><span>${i.name} (x${i.qty})</span><span>INR ${i.price * i.qty}</span></div>`).join("");
}

function goToMyOrders() {
    closeAllModals();
    openUserDashboard();
    switchUDashTab("orders");
}

async function loadOrders() {
    const body = el("ordersTableBody");
    if (!body || !getToken()) return;
    try {
        const res = await fetch(`${API_URL}/orders`, { headers: getAuthHeaders() });
        const orders = await res.json();
        if (!res.ok || !Array.isArray(orders)) return showToast("Could not load orders", "error");
        body.innerHTML = orders.map((o) => `<tr><td>#${o.id}</td><td>${o.created_at ? new Date(o.created_at).toLocaleString() : "-"}</td><td>${o.items || "-"}</td><td>${paymentLabel(o.payment_method)}</td><td>INR ${o.total_amount ?? "-"}</td><td><span class="status-badge ${statusBadgeClass(o.status || o.payment_status)}">${o.status || o.payment_status || "-"}</span></td><td>${o.estimated_delivery ? new Date(o.estimated_delivery).toLocaleDateString() : "-"}</td></tr>`).join("");
    } catch (err) {
        console.error(err);
        showToast("Could not load orders", "error");
    }
}

async function loadOrdersPage() {
    const body = el("ordersPageTableBody");
    const phoneHeader = el("ordersPagePhoneHeader");
    const addressHeader = el("ordersPageAddressHeader");
    if (!body || !getToken()) return;
    if (phoneHeader) phoneHeader.style.display = isUserAdmin() ? "table-cell" : "none";
    if (addressHeader) addressHeader.style.display = isUserAdmin() ? "table-cell" : "none";
    try {
        const res = await fetch(`${API_URL}/${isUserAdmin() ? "admin/orders" : "orders"}`, { headers: getAuthHeaders() });
        const orders = await res.json();
        if (!res.ok || !Array.isArray(orders)) return showToast("Could not load orders", "error");
        body.innerHTML = orders.map((o) => {
            const statusCell = isUserAdmin()
                ? renderAdminStatusControl(o)
                : `<span class="status-badge ${statusBadgeClass(o.status || o.payment_status)}">${o.status || o.payment_status || "-"}</span>`;

            return `<tr>
                <td>#${o.id}</td>
                <td>${o.created_at ? new Date(o.created_at).toLocaleString() : "-"}</td>
                ${isUserAdmin() ? `<td>${o.phone || "-"}</td>` : ""}
                ${isUserAdmin() ? `<td>${formatOrderAddress(o) || "-"}</td>` : ""}
                <td>${o.items || "-"}</td>
                <td>${paymentLabel(o.payment_method)}</td>
                <td>INR ${o.total_amount ?? "-"}</td>
                <td>${statusCell}</td>
                <td>${o.estimated_delivery ? new Date(o.estimated_delivery).toLocaleDateString() : "-"}</td>
            </tr>`;
        }).join("");
    } catch (err) {
        console.error(err);
        showToast("Could not load orders", "error");
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        const res = await fetch(`${API_URL}/admin/orders/${orderId}/status`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (!res.ok || !data.success) return showToast(data.error || "Could not update order status", "error");
        showToast("Order status updated", "success");
        loadOrdersPage();
    } catch (err) {
        console.error(err);
        showToast("Could not update order status", "error");
    }
}

async function loadCurrentUser() {
    if (!getToken()) return;
    try {
        const res = await fetch(`${API_URL}/me`, { headers: getAuthHeaders() });
        const user = await res.json();
        if (!res.ok) return;
        if (user.email != null) localStorage.setItem("lamioCurrentUser", user.email);
        if (user.name != null) localStorage.setItem("lamioCurrentUserName", user.name);
        if (user.phone != null) localStorage.setItem("lamioCurrentUserPhone", user.phone);
        populateUserProfileFromStorage();
    } catch (err) {
        console.error(err);
    }
}

async function saveProfile() {
    const name = el("profileEditName")?.value.trim() || "";
    const rawPhone = el("profileEditPhone")?.value || "";
    const phone = normalizePhone(rawPhone);

    if (!name) return showToast("Enter your name", "error");
    if (!/^\d{10}$/.test(phone)) {
        return showToast("Enter a valid 10-digit phone number", "error");
    }

    try {
        const res = await fetch(`${API_URL}/me`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({ name, phone })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            return showToast(data.error || "Profile update failed", "error");
        }
        
        localStorage.setItem("lamioCurrentUserName", name);
        localStorage.setItem("lamioCurrentUserPhone", phone);

        populateUserProfileFromStorage();
        updateNavAuthState();

        showToast("Profile updated", "success");

        setTimeout(() => {
            if (isUserAdmin()) loadOrdersPage();
        }, 300);

    } catch (err) {
        console.error(err);
        showToast("Network error", "error");
    }
}

async function autoLocateAddress(event) {
    if (event) event.preventDefault();
    if (!navigator.geolocation) return showToast("Geolocation is not supported on this device", "error");
    showToast("Fetching location...", "info");
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
            const data = await res.json();
            const addr = data.address || {};
            if (el("addrLine")) el("addrLine").value = [addr.house_number, addr.road, addr.suburb, addr.neighbourhood, addr.village, addr.town].filter(Boolean).join(", ") || data.display_name || "";
            if (el("addrCity")) el("addrCity").value = addr.city || addr.town || addr.village || addr.county || "";
            if (el("addrPincode")) el("addrPincode").value = addr.postcode || "";
            if (el("mapContainer")) {
                el("mapContainer").style.display = "block";
                el("mapContainer").innerHTML = `<iframe width="100%" height="100%" style="border:0" loading="lazy" allowfullscreen src="https://maps.google.com/maps?q=${lat},${lon}&z=15&output=embed"></iframe>`;
            }
            showToast("Location detected", "success");
        } catch (err) {
            console.error(err);
            showToast("Could not detect address", "error");
        }
    }, (err) => {
        console.error(err);
        showToast(err.code === 1 ? "Location permission denied" : "Could not get location", "error");
    });
}

async function loadAdminProducts() {
    if (!isUserAdmin()) return;
    try {
        const res = await fetch(`${API_URL}/products`);
        const products = await res.json();
        allProducts = Array.isArray(products) ? products : [];
        renderAdminProductList(allProducts);
    } catch (err) {
        console.error(err);
        showToast("Could not load product list", "error");
    }
}

function renderAdminProductList(products) {
    const box = el("adminProductList");
    if (!box) return;
    if (!products.length) {
        box.innerHTML = "<p>No products found yet.</p>";
        return;
    }
    box.innerHTML = products.map((p) => `<div class="admin-product-item" style="padding:12px 15px;margin-bottom:12px;border:1px solid #ddd;border-radius:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;"><div style="display:flex;gap:12px;align-items:center;"><img src="${p.image || "./logo.png"}" alt="${p.name}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid #eee;"><div><strong>${p.name}</strong><br><small>${p.category_name || "Uncategorized"} · ${p.status || "Unknown"} · ${p.cod_enabled ? "COD allowed" : "Online only"}</small></div></div><div style="text-align:right;min-width:140px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;"><span style="font-weight:600;">INR ${p.price}</span><div style="display:flex;gap:6px;"><button onclick="editProduct(${p.id})" style="padding:4px 12px;font-size:12px;background:#D4AF37;color:#fff;border:none;border-radius:5px;cursor:pointer;">Edit</button><button onclick="deleteProduct(${p.id})" style="padding:4px 12px;font-size:12px;background:#c0392b;color:#fff;border:none;border-radius:5px;cursor:pointer;">Delete</button></div></div></div>`).join("");
}

function editProduct(id) {
    const p = allProducts.find((item) => item.id === id);
    if (!p) return;
    if (el("editProductId")) el("editProductId").value = p.id;
    if (el("editProductName")) el("editProductName").value = p.name;
    if (el("editProductPrice")) el("editProductPrice").value = p.price;
    if (el("editProductStatus")) el("editProductStatus").value = p.status || "In Stock";
    if (el("editProductCategory")) el("editProductCategory").value = p.category_id || "---";
    if (el("editProductCOD")) el("editProductCOD").checked = !!p.cod_enabled;
    showToast("Editing product", "info");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearAdminForm() {
    ["editProductId", "editProductName", "editProductPrice"].forEach((id) => {
        if (el(id)) el(id).value = "";
    });
    if (el("editProductImageFile")) el("editProductImageFile").value = "";
    if (el("editProductImagePreview")) el("editProductImagePreview").textContent = "";
    if (el("editProductStatus")) el("editProductStatus").value = "In Stock";
    if (el("editProductCategory")) el("editProductCategory").value = "Gift";
    if (el("editProductCOD")) el("editProductCOD").checked = false;
}

async function saveProduct() {
    if (!getToken() || !isUserAdmin())
        return showToast("Admin access required", "error");

    const productId = el("editProductId")?.value || "";
    const categoryEl = el("editProductCategory");
    const name = el("editProductName")?.value.trim() || "";
    const price = Number(el("editProductPrice")?.value || 0);

    if (!name || price <= 0)
        return showToast("Enter a valid product name and price", "error");

    const formData = new FormData();

    formData.append("name", name);
    formData.append(
        "description",
        `${name} - ${categoryEl?.selectedOptions?.[0]?.text || ""}`
    );
    formData.append("price", price);
    formData.append(
        "stock",
        (el("editProductStatus")?.value || "In Stock") === "In Stock"
            ? 20
            : 0
    );
    formData.append(
        "status",
        el("editProductStatus")?.value || "In Stock"
    );
    formData.append(
        "category_id",
        parseInt(categoryEl?.value || 1)
    );
    formData.append(
        "cod_enabled",
        el("editProductCOD")?.checked
            ? 1
            : 0
    );

    const file = el("editProductImageFile")?.files?.[0];
    if (file) formData.append("image", file);

    try {
        const res = await fetch(
            `${API_URL}/products${productId ? `/${productId}` : ""}`,
            {
                method: productId ? "PUT" : "POST",
                headers: {
                    Authorization: `Bearer ${getToken()}`
                },
                body: formData
            }
        );

        const data = await res.json();

        if (!res.ok || !data.success)
            return showToast(
                data.error || "Could not save product",
                "error"
            );

        clearAdminForm();
        await loadAdminProducts();
        await getProducts();

        showToast(
            productId
                ? "Product updated"
                : "Product created",
            "success"
        );

    } catch (err) {
        console.error(err);
        showToast("Could not save product", "error");
    }
}

async function deleteProduct(id) {
    if (!confirm("Delete this product?")) return;
    try {
        const res = await fetch(`${API_URL}/products/${id}`, { method: "DELETE", headers: getAuthHeaders() });
        const data = await res.json();
        if (!res.ok || !data.success) return showToast(data.error || "Delete failed", "error");
        await loadAdminProducts();
        await getProducts();
        showToast("Product deleted", "success");
    } catch (err) {
        console.error(err);
        showToast("Delete failed", "error");
    }
}

function logout() {
    localStorage.clear();
    cart = [];
    userAddresses = [];
    selectedPayment = null;
    location.reload();
}

window.addEventListener("load", () => {
    const loader = document.getElementById("loader");

    initPasswordToggles();
    loadCart();
    updateNavAuthState();
    closeAllModals();

    if (getToken()) {
        loadCurrentUser();
        fetchAddresses();
    }

    getProducts();

    const params=new URLSearchParams(location.search);
    const productId=params.get("id");
    if(productId) loadProductPage(productId);

    if (isUserAdmin()) {
        showAdminDashboard();
    } else {
        showHome();
    }

    if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => loader.style.display = "none", 200);
    }
});
