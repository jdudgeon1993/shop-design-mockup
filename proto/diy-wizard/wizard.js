(function () {
    var CART_KEY = 'diyCart';

    function readCart() {
        try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
        catch (e) { return []; }
    }
    function writeCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
    function currency(n) { return '$' + n.toFixed(2); }
    function cartTotal(cart) { return cart.reduce(function (sum, c) { return sum + c.lineTotal; }, 0); }

    // ---- Builder page ----
    var form = document.getElementById('wizard-form');
    if (form) {
        var cabinetTotalEl = document.getElementById('cabinet-total');
        var rollingTotalEl = document.getElementById('rolling-total');
        var saveNote = document.getElementById('save-note');

        var unitPrice = function () {
            var total = 0;
            form.querySelectorAll('input[type=radio]:checked').forEach(function (input) {
                total += parseFloat(input.dataset.price || '0');
            });
            return total;
        };

        var quantity = function () {
            var q = parseInt(form.quantity.value, 10);
            return (Number.isFinite(q) && q > 0) ? q : 1;
        };

        var refreshTotals = function () {
            var unit = unitPrice();
            var qty = quantity();
            var cabinetTotal = unit * qty;
            var rolling = cartTotal(readCart()) + cabinetTotal;
            cabinetTotalEl.textContent = currency(cabinetTotal);
            rollingTotalEl.textContent = currency(rolling);
        };

        var buildCabinetRecord = function () {
            var data = new FormData(form);
            var unit = unitPrice();
            var qty = quantity();
            return {
                cabinetType: data.get('cabinetType'),
                finish: data.get('finish'),
                width: data.get('width'),
                height: data.get('height'),
                depth: data.get('depth'),
                doorStyle: data.get('doorStyle'),
                hardware: data.get('hardware'),
                name: data.get('name'),
                quantity: qty,
                unitPrice: unit,
                lineTotal: unit * qty
            };
        };

        // The browser's native pre-submit validation (triggered by clicking the
        // type="submit" button) runs before any 'submit' listener does, so a
        // required field hidden inside a closed step would otherwise block
        // submission with zero visible feedback. The 'invalid' event still
        // fires on each bad field even then — use it to open that step.
        form.addEventListener('invalid', function (e) {
            var details = e.target.closest('details.wizard-step');
            if (details) details.open = true;
        }, true);

        var revealFirstInvalidStep = function () {
            var invalid = form.querySelector(':invalid');
            var details = invalid && invalid.closest('details.wizard-step');
            if (details) details.open = true;
        };

        var saveCabinet = function () {
            revealFirstInvalidStep();
            if (!form.reportValidity()) return false;
            var cart = readCart();
            cart.push(buildCabinetRecord());
            writeCart(cart);
            return true;
        };

        form.addEventListener('input', refreshTotals);
        form.addEventListener('change', refreshTotals);
        refreshTotals();

        document.getElementById('save-close').addEventListener('click', function () {
            if (saveCabinet()) window.location.href = '../index.html';
        });

        document.getElementById('save-next').addEventListener('click', function () {
            if (saveCabinet()) {
                form.reset();
                refreshTotals();
                saveNote.hidden = false;
                saveNote.textContent = 'Cabinet saved. Build the next one.';
                setTimeout(function () { saveNote.hidden = true; }, 3000);
            }
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (saveCabinet()) window.location.href = 'review.html';
        });
    }

    // ---- Review page ----
    var quoteItems = document.getElementById('quote-items');
    if (quoteItems) {
        var cart = readCart();
        var taxRate = parseFloat(document.body.dataset.taxRate || '0');
        var deliveryRate = parseFloat(document.body.dataset.deliveryRate || '0');

        var render = function () {
            if (!cart.length) {
                quoteItems.innerHTML = '<p class="empty-msg">No cabinets saved yet. <a href="index.html">Start building one</a>.</p>';
            } else {
                quoteItems.innerHTML = cart.map(function (c, i) {
                    return '' +
                        '<div class="quote-item">' +
                        '<div class="quote-item-thumb"></div>' +
                        '<div class="quote-item-body">' +
                        '<h4>' + (c.name || 'Unnamed Cabinet') + '</h4>' +
                        '<p>' +
                        c.cabinetType + ' cabinet, ' + c.finish + ' finish<br>' +
                        c.width + '&quot; x ' + c.height + '&quot; x ' + c.depth + '&quot;<br>' +
                        c.doorStyle + ' door, ' + c.hardware + ' hardware<br>' +
                        'Qty: ' + c.quantity +
                        '</p>' +
                        '<div class="quote-item-subtotal">' + currency(c.lineTotal) + '</div>' +
                        '</div>' +
                        '<button type="button" class="quote-item-remove" data-index="' + i + '">Remove</button>' +
                        '</div>';
                }).join('');
            }

            var subtotal = cartTotal(cart);
            var tax = subtotal * taxRate;
            var delivery = subtotal * deliveryRate;
            var grand = subtotal + tax + delivery;

            document.getElementById('quote-subtotal').textContent = currency(subtotal);
            document.getElementById('quote-tax').textContent = currency(tax);
            document.getElementById('quote-delivery').textContent = currency(delivery);
            document.getElementById('quote-grand').textContent = currency(grand);
        };

        quoteItems.addEventListener('click', function (e) {
            var btn = e.target.closest('.quote-item-remove');
            if (!btn) return;
            cart.splice(parseInt(btn.dataset.index, 10), 1);
            writeCart(cart);
            render();
        });

        document.getElementById('restart').addEventListener('click', function () {
            writeCart([]);
            window.location.href = 'index.html';
        });

        var agreementForm = document.getElementById('agreement-form');
        agreementForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (agreementForm.reportValidity()) window.location.href = 'thank-you.html';
        });

        render();
    }
})();
