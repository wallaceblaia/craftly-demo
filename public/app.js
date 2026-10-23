// Product cards are built with DOM nodes and textContent: nothing from the API is parsed as HTML.

function card(p) {
  const el = document.createElement('div');
  el.className = 'card';
  const title = document.createElement('h3');
  title.textContent = p.name;
  const description = document.createElement('p');
  description.textContent = p.description || '';
  const price = document.createElement('b');
  price.textContent = '$' + Number(p.price).toFixed(2);
  const maker = document.createElement('small');
  maker.textContent = 'by ' + (p.maker || 'a local maker');
  el.append(title, description, price, document.createElement('br'), maker);
  return el;
}

async function load(q) {
  const url = q ? '/api/products/search?q=' + encodeURIComponent(q) : '/api/products';
  const items = await fetch(url).then((r) => r.json());
  document.getElementById('list').replaceChildren(...items.map(card));
}

let timer;
document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => load(e.target.value), 250);
});
load();
