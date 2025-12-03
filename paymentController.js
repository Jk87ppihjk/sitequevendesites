<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Checkout - SiteMarket</title>

  <!-- DEV: Tailwind CDN (em produção use build/CLI) -->
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>

  <!-- SDK Mercado Pago -->
  <script src="https://sdk.mercadopago.com/js/v2"></script>

  <style>
    body { font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
    .fade-in { animation: fadeIn .4s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
  </style>
</head>
<body class="bg-gray-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50">

<div class="max-w-6xl mx-auto p-6">
  <h1 class="text-3xl font-bold mb-6">Finalizar Compra</h1>

  <div id="feedback-msg" class="hidden mb-4 p-3 rounded font-semibold"></div>

  <div class="grid lg:grid-cols-3 gap-8">
    <aside class="lg:col-span-1">
      <div class="p-4 bg-white dark:bg-slate-800 rounded shadow">
        <h2 class="font-bold mb-3">Resumo</h2>
        <div id="site-name-summary">Carregando...</div>
        <div id="item-price-summary" class="font-bold mt-2">R$ 0,00</div>
      </div>
    </aside>

    <section class="lg:col-span-2">
      <form id="customer-form" class="p-6 bg-white dark:bg-slate-800 rounded shadow fade-in">
        <label>Nome</label>
        <input id="full-name" class="w-full p-2 border rounded mb-3" required/>
        <label>Email</label>
        <input id="email" type="email" class="w-full p-2 border rounded mb-3" required/>
        <label>CPF/CNPJ</label>
        <input id="cpf-cnpj" class="w-full p-2 border rounded mb-3" required/>

        <div class="grid grid-cols-2 gap-3">
          <input id="cep" placeholder="CEP" class="p-2 border rounded" required/>
          <input id="address" placeholder="Rua" class="p-2 border rounded" required/>
        </div>
        <div class="grid grid-cols-3 gap-3 mt-3">
          <input id="number" placeholder="Número" class="p-2 border rounded" required/>
          <input id="city" placeholder="Cidade" class="p-2 border rounded" required/>
          <input id="state" placeholder="UF" class="p-2 border rounded" required/>
        </div>

        <button id="go-to-payment-btn" class="mt-4 w-full bg-blue-600 text-white py-3 rounded font-bold">Ir para pagamento</button>
      </form>

      <div id="loading-payment" class="hidden mt-6 p-6 text-center">Conectando ao Mercado Pago...</div>

      <!-- container do Brick -->
      <div id="payment-brick-container" class="hidden mt-6 p-4 bg-white dark:bg-slate-800 rounded shadow"></div>
    </section>
  </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
  // CONFIG - atualize para seus valores
  const MP_PUBLIC_KEY = 'TEST-COLOQUE_SUA_PUBLIC_KEY_AQUI'; // substitua pela public key válida (test/prod)
  const API_BASE_URL = 'https://sitequevendesites.onrender.com/api';
  const LOGIN_URL = 'login.html';
  const SUCCESS_URL = 'compra-concluida.html';

  const params = new URLSearchParams(window.location.search);
  const siteId = params.get('siteId');
  const purchaseType = params.get('type');
  const price = Number(params.get('price'));

  const token = localStorage.getItem('userToken');

  const feedbackMsg = document.getElementById('feedback-msg');
  const form = document.getElementById('customer-form');
  const loading = document.getElementById('loading-payment');
  const brickContainer = document.getElementById('payment-brick-container');

  function showFeedback(msg, type='error') {
    if (!msg) { feedbackMsg.classList.add('hidden'); return; }
    feedbackMsg.classList.remove('hidden');
    feedbackMsg.textContent = msg;
    feedbackMsg.className = type === 'error' ? 'mb-4 p-3 rounded bg-red-100 text-red-700' : 'mb-4 p-3 rounded bg-green-100 text-green-700';
    feedbackMsg.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  async function init() {
    if (!token) return window.location.href = LOGIN_URL;
    if (!siteId || isNaN(price)) return showFeedback('Dados do pedido inválidos.', 'error');
    if (price < 1) return showFeedback('Valor mínimo R$ 1,00.', 'error');

    try {
      const r = await fetch(`${API_BASE_URL}/sites/${siteId}`);
      const site = await r.json();
      document.getElementById('site-name-summary').textContent = site.name || 'Site';
      document.getElementById('item-price-summary').textContent = price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    } catch(e) { console.error('site load', e); }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showFeedback('', '');
    form.classList.add('hidden');
    loading.classList.remove('hidden');

    const customer = {
      fullName: document.getElementById('full-name').value.trim(),
      email: document.getElementById('email').value.trim(),
      cpfCnpj: document.getElementById('cpf-cnpj').value.trim(),
      address: {
        zipCode: document.getElementById('cep').value.trim(),
        streetName: document.getElementById('address').value.trim(),
        streetNumber: document.getElementById('number').value.trim(),
        city: document.getElementById('city').value.trim(),
        state: document.getElementById('state').value.trim()
      }
    };

    // valida básica
    if (!customer.fullName || !customer.email) {
      loading.classList.add('hidden'); form.classList.remove('hidden'); return showFeedback('Nome e e-mail obrigatórios.');
    }
    const rawDoc = (customer.cpfCnpj || '').replace(/\D/g,'');
    if (!rawDoc || rawDoc.length < 11) {
      loading.classList.add('hidden'); form.classList.remove('hidden'); return showFeedback('CPF/CNPJ inválido.');
    }

    const body = {
      siteId,
      purchaseType,
      price,
      siteName: document.getElementById('site-name-summary').textContent,
      customer
    };

    try {
      const resp = await fetch(`${API_BASE_URL}/payment/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });

      const data = await resp.json();
      if (!resp.ok) {
        console.error('create-preference error:', data);
        loading.classList.add('hidden'); form.classList.remove('hidden');
        return showFeedback(data.message || 'Erro ao iniciar pagamento.', 'error');
      }

      if (!data.preferenceId) {
        loading.classList.add('hidden'); form.classList.remove('hidden');
        console.error('Resposta sem preferenceId', data);
        return showFeedback('Resposta inválida do servidor (preferenceId ausente).', 'error');
      }

      // guarantee amount present (backend returns amount)
      if (typeof data.amount === 'undefined') data.amount = price;

      // mostra container ANTES de renderizar
      brickContainer.innerHTML = '';
      brickContainer.classList.remove('hidden');

      // renderiza Brick com preferenceId + amount (exigência atual)
      await renderBrick(data.preferenceId, Number(data.amount));

      loading.classList.add('hidden');
    } catch (err) {
      console.error('Erro ao chamar create-preference:', err);
      loading.classList.add('hidden'); form.classList.remove('hidden');
      showFeedback('Erro ao iniciar pagamento. Tente novamente.', 'error');
    }
  });

  async function renderBrick(preferenceId, amount) {
    if (!MP_PUBLIC_KEY || MP_PUBLIC_KEY.includes('COLOQUE')) {
      throw new Error('Public key do Mercado Pago não configurada no front-end.');
    }
    try {
      const mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });
      const bricks = mp.bricks();

      const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');

      const settings = {
        initialization: {
          preferenceId,
          amount: Number(amount) // **obrigatório**
        },
        customization: {
          paymentMethods: {
            creditCard: 'all',
            ticket: 'all',
            bankTransfer: 'all'
          },
          visual: {
            style: { theme: isDark ? 'dark' : 'default' }
          }
        },
        callbacks: {
          onReady: () => {
            console.log('BRICK pronto');
            brickContainer.scrollIntoView({ behavior:'smooth', block:'start' });
          },
          onError: (err) => {
            console.error('BRICK error', err);
            showFeedback('Erro ao carregar o formulário de pagamento. Verifique as configurações do Mercado Pago.', 'error');
          },
          onFinalization: (processResponse, error) => {
            if (error) {
              console.error('FINALIZATION error', error);
              showFeedback('Falha no pagamento. Tente novamente.', 'error');
              return;
            }
            console.log('FINALIZATION', processResponse);
            if (processResponse && processResponse.status === 'approved') {
              showFeedback('Pagamento aprovado! Redirecionando...', 'success');
              setTimeout(() => window.location.href = `${SUCCESS_URL}?orderId=${processResponse.id}`, 800);
            } else {
              showFeedback('Pagamento processado. Verifique instruções por e-mail.', 'success');
            }
          }
        }
      };

      await bricks.create('payment', 'payment-brick-container', settings);
    } catch (e) {
      console.error('Erro ao renderizar Brick:', e);
      showFeedback('Erro ao renderizar o formulário de pagamento.', 'error');
      throw e;
    }
  }

  init();
});
</script>
</body>
</html>
