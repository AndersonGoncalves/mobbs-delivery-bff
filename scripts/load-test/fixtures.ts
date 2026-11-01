// Pools de texto só pra dar cara de dado real aos documentos sintéticos — não tem papel
// estrutural (nenhum código do app depende destes valores específicos).
export const RESTAURANT_SEGMENTS = ['Pizzaria', 'Hamburgueria', 'Lanchonete', 'Restaurante', 'Churrascaria', 'Sushi', 'Pastelaria', 'Açaiteria', 'Marmitaria', 'Cantina'];
export const RESTAURANT_SUFFIXES = ['do Centro', 'da Praça', 'Bella', 'Express', "D'Italia", 'Gourmet', 'da Vila', 'do Bairro', 'Real', 'Dois Irmãos', 'da Esquina', 'Sabor da Terra'];

export const PRODUCT_NAMES_BY_CATEGORY: Record<string, string[]> = {
  Lanches: ['X-Burger', 'X-Bacon', 'X-Salada', 'X-Tudo', 'Cheeseburguer Duplo', 'Misto Quente'],
  Pizzas: ['Pizza Calabresa', 'Pizza Mussarela', 'Pizza Frango com Catupiry', 'Pizza Portuguesa', 'Pizza 4 Queijos', 'Pizza Marguerita'],
  Bebidas: ['Coca-Cola 350ml', 'Guaraná 350ml', 'Água Mineral', 'Suco de Laranja', 'Suco de Maracujá', 'Cerveja Long Neck'],
  Sobremesas: ['Pudim', 'Petit Gateau', 'Brownie', 'Sorvete', 'Mousse de Maracujá'],
  Pratos: ['Feijoada', 'Strogonoff de Frango', 'Picanha na Chapa', 'Filé à Parmegiana', 'Lasanha à Bolonhesa'],
  Combos: ['Combo Casal', 'Combo Família', 'Combo Individual'],
};
export const MENU_CATEGORY_NAMES = Object.keys(PRODUCT_NAMES_BY_CATEGORY);

export const RAW_MATERIAL_NAMES = [
  'Queijo Mussarela',
  'Carne Moída',
  'Pão de Hambúrguer',
  'Alface',
  'Tomate',
  'Cebola',
  'Molho de Tomate',
  'Calabresa',
  'Bacon',
  'Catupiry',
  'Frango Desfiado',
  'Farinha de Trigo',
  'Óleo de Soja',
  'Batata Palito',
  'Maionese',
];

export const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Patrícia', 'Rafael', 'Sofia', 'Thiago', 'Vitória', 'William'];
export const LAST_NAMES = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Lima', 'Ferreira', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Melo'];

export const NEIGHBORHOODS = ['Centro', 'Jardim América', 'Vila Nova', 'Boa Vista', 'Santa Clara', 'São José', 'Parque das Flores', 'Cidade Nova', 'Bela Vista', 'Vila Rica'];
export const CITIES_WITH_STATE: { city: string; state: string }[] = [
  { city: 'São Paulo', state: 'SP' },
  { city: 'Fortaleza', state: 'CE' },
  { city: 'Belo Horizonte', state: 'MG' },
  { city: 'Curitiba', state: 'PR' },
  { city: 'Recife', state: 'PE' },
  { city: 'Porto Alegre', state: 'RS' },
  { city: 'Salvador', state: 'BA' },
  { city: 'Goiânia', state: 'GO' },
];

export const PAYMENT_METHODS = ['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash'] as const;
export const ORDER_TYPES = ['delivery', 'pickup'] as const;
