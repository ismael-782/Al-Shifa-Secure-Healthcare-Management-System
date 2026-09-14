/**
 * Auth JS — Login, Registration, MFA, Logout
 * Handles all authentication flows and redirects.
 * Password visibility toggle, client-side policy hint, form validation.
 */
'use strict';

// ── Login Form ────────────────────────────────────────────────────────────

async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const btn  = form.querySelector('#login-btn');
    const errEl = document.getElementById('login-error');

    const username = form.username.value.trim();
    const password = form.password.value;

    if (!username || !password) {
        showFieldError(errEl, 'Please enter your username and password.');
        return;
    }

    setButtonLoading(btn, true);
    clearError(errEl);

    try {
        const res = await apiFetch('/api/v1/auth/login', {
            method: 'POST',
            body: { username, password },
        });

        if (!res) return; // apiFetch handled redirect

        if (res.ok) {
            if (res.data.mfaRequired) {
                // Store pending state and go to MFA page
                sessionStorage.setItem('mfa_pending', 'true');
                window.location.href = '/mfa.html';
            } else {
                redirectToDashboard(res.data.role);
            }
        } else {
            showFieldError(errEl, res.data.error || 'Login failed. Please try again.');
        }
    } catch (err) {
        showFieldError(errEl, 'Network error. Please check your connection.');
    } finally {
        setButtonLoading(btn, false);
    }
}

// ── Registration Form ─────────────────────────────────────────────────────

async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const btn  = form.querySelector('#register-btn');
    const errEl = document.getElementById('register-error');

    const password  = form.password.value;
    const confirmPw = form.confirmPassword.value;

    if (password !== confirmPw) {
        showFieldError(errEl, 'Passwords do not match.');
        return;
    }

    const payload = {
        username:               form.username.value.trim(),
        email:                  form.email.value.trim(),
        password,
        fullName:               form.fullName.value.trim(),
        dateOfBirth:            form.dateOfBirth.value,
        contactPhone:           form.contactPhone?.value?.trim() || '',
        contactAddress:         form.contactAddress?.value?.trim() || '',
        insuranceProviderName:  form.insuranceProviderName?.value?.trim() || '',
        insurancePolicyNumber:  form.insurancePolicyNumber?.value?.trim() || '',
    };

    setButtonLoading(btn, true);
    clearError(errEl);

    try {
        const res = await apiFetch('/api/v1/auth/register', {
            method: 'POST',
            body: payload,
        });

        if (!res) return;

        if (res.ok) {
            showToast('Registration successful! Please log in.', 'success');
            setTimeout(() => { window.location.href = '/index.html'; }, 1500);
        } else {
            showFieldError(errEl, res.data.error || 'Registration failed.');
        }
    } catch (err) {
        showFieldError(errEl, 'Network error. Please try again.');
    } finally {
        setButtonLoading(btn, false);
    }
}

// ── MFA Verification ──────────────────────────────────────────────────────

async function handleMfaVerify(e) {
    e.preventDefault();
    const form  = e.target;
    const btn   = form.querySelector('#mfa-btn');
    const errEl = document.getElementById('mfa-error');

    // Collect 6 OTP digits from individual input boxes
    const inputs = form.querySelectorAll('.otp-input');
    const otp = Array.from(inputs).map((i) => i.value).join('');

    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        showFieldError(errEl, 'Please enter the complete 6-digit code.');
        return;
    }

    setButtonLoading(btn, true);
    clearError(errEl);

    try {
        const res = await apiFetch('/api/v1/auth/mfa', {
            method: 'POST',
            body: { otp },
        });

        if (!res) return;

        if (res.ok) {
            sessionStorage.removeItem('mfa_pending');
            redirectToDashboard(res.data.role);
        } else {
            showFieldError(errEl, res.data.error || 'Invalid or expired code.');
            inputs.forEach((i) => { i.value = ''; });
            inputs[0].focus();
        }
    } catch {
        showFieldError(errEl, 'Network error. Please try again.');
    } finally {
        setButtonLoading(btn, false);
    }
}

// ── OTP Input — keyboard navigation ──────────────────────────────────────

function initOtpInputs() {
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            // Allow only digits
            input.value = input.value.replace(/\D/g, '').slice(0, 1);
            if (input.value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                inputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            inputs.forEach((inp, i) => { inp.value = paste[i] || ''; });
            const lastFilled = Math.min(paste.length - 1, inputs.length - 1);
            inputs[lastFilled]?.focus();
            e.preventDefault();
        });
    });
}

// ── Password Visibility Toggle ────────────────────────────────────────────

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

// ── Password Strength Indicator ───────────────────────────────────────────

function checkPasswordStrength(password) {
    const checks = {
        length:  password.length >= 8,
        upper:   /[A-Z]/.test(password),
        lower:   /[a-z]/.test(password),
        number:  /\d/.test(password),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    };

    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score, strong: score === 5 };
}

function updatePasswordStrengthUI(password) {
    const bar = document.getElementById('pw-strength-bar');
    const hint = document.getElementById('pw-strength-hint');
    if (!bar) return;

    const { score } = checkPasswordStrength(password);
    const pct = (score / 5) * 100;
    const colors = ['#e74c3c', '#e74c3c', '#f39c12', '#f39c12', '#27ae60', '#27ae60'];
    const labels = ['', 'Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

    bar.style.width = pct + '%';
    bar.style.background = colors[score];
    if (hint) hint.textContent = labels[score];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function showFieldError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function clearError(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loader"></span> Processing…';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        btn.disabled = false;
    }
}

// ── Logout Button ─────────────────────────────────────────────────────────

async function handleLogout() {
    await performLogout();
}
