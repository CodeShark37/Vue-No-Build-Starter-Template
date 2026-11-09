// Seed de books — DADOS do 2.º recurso, que demonstra o caminho rápido da
// fábrica (dev/mock/crud.js): um domínio novo é seed (aqui) + política
// (subject 'Book' em seeds/permissions.js) + um routes/books.js de ~10 linhas.
// 7 livros: 2 páginas de 6 no GET /api/books (?per_page=6).
// pages é número DE VERDADE (não texto) — é o demo da coluna numérica da
// DataTable (Intl pt-PT + alinhamento à direita) e da ordenação numérica do
// servidor (numericSorts em routes/books.js). O year continua TEXTO: anos não
// levam formatação numérica.
/**
 * Catálogo de demonstração do 2.º recurso (caminho rápido da fábrica
 * registerCrud). pages é NÚMERO de verdade — alimenta a coluna numérica da
 * DataTable e a ordenação numericSorts do servidor; year fica em texto.
 * @type {Array<{title: string, author: string, year: string, pages: number}>}
 */
export const seedBooks = [
    { title: 'Dom Casmurro', author: 'Machado de Assis', year: '1899', pages: 240 },
    { title: 'Os Lusíadas', author: 'Luís de Camões', year: '1572', pages: 1008 },
    { title: 'Memórias Póstumas de Brás Cubas', author: 'Machado de Assis', year: '1881', pages: 336 },
    { title: 'Vidas Secas', author: 'Graciliano Ramos', year: '1938', pages: 198 },
    { title: 'A Hora da Estrela', author: 'Clarice Lispector', year: '1977', pages: 112 },
    { title: 'O Cortiço', author: 'Aluísio Azevedo', year: '1890', pages: 304 },
    { title: 'Iracema', author: 'José de Alencar', year: '1865', pages: 208 },
];
