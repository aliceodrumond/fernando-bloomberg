# Pulse Terminal

Pagina web inspirada em um terminal Bloomberg com fonte de dados no Yahoo Finance.

## O que esta pronto

- cards para BRL, USD, IBOVESPA, S&P, GOLD e Brent 1st future
- spot em destaque
- lista expandida com commodities, acoes brasileiras, big techs e bitcoin
- variacao percentual de 1 dia, 1 mes, YTD e 1 ano
- refresh automatico a cada 60 segundos
- abertura com um clique no Windows
- servidor local em PowerShell sem depender de Node

## Como rodar

### Opcao recomendada: abrir com um clique

Clique duas vezes em `C:\Users\alice\Downloads\bloomberg-yahoo-dashboard\Abrir Pulse Terminal.bat`.

Esse arquivo:

- sobe um servidor local em PowerShell
- abre o navegador automaticamente
- carrega os dados do Yahoo Finance sem precisar de Node

### Opcao 2: usar servidor local

1. Abra um terminal na pasta `C:\Users\alice\Downloads\bloomberg-yahoo-dashboard`
2. Rode `npm start`
3. Abra `http://localhost:3000`

Essa opcao continua disponivel se voce preferir usar Node.

## Publicar online

O projeto ficou pronto para deploy em Vercel.

1. Crie uma conta em [Vercel](https://vercel.com/)
2. Suba esta pasta para um repositorio no GitHub
3. Em Vercel, clique em `Add New Project`
4. Importe o repositorio
5. Publique sem precisar mudar build command

Arquivos importantes para isso:

- `api/market.js`: funcao serverless que consulta o Yahoo Finance
- `vercel.json`: configuracao de deploy
- `index.html`, `app.js`, `styles.css`: frontend estatico

Depois do deploy, voce recebe um link publico no formato `https://seu-projeto.vercel.app` e pode compartilhar com qualquer pessoa.

## DIs

Os ativos `DI 27`, `DI 28`, `DI 31` e `DI 36` usam um proxy da curva prefixada da ANBIMA em vez do Yahoo Finance.

Leitura adotada no painel:

- `DI 27`: proxy para jan/2027
- `DI 28`: proxy para jan/2028
- `DI 31`: proxy para jan/2031
- `DI 36`: proxy para jan/2036

Esse preenchimento e uma aproximacao por interpolacao na ETTJ PRE da ANBIMA.

## Sobre os DIs

Os cards `DI 27`, `DI 28`, `DI 31` e `DI 36` foram deixados no layout, mas em modo de configuracao.

Motivo: nao encontrei um ticker do Yahoo Finance com cobertura claramente valida e consistente para esses vencimentos especificos da curva DI da B3.

Quando voce confirmar os tickers corretos, basta editar `C:\Users\alice\Downloads\bloomberg-yahoo-dashboard\app.js` e substituir `symbol: null` pelo codigo correspondente.

## Arquitetura

- `server.js`: servidor HTTP simples e proxy para o endpoint de chart do Yahoo Finance
- `index.html`: estrutura da pagina
- `styles.css`: visual estilo terminal financeiro
- `app.js`: configuracao dos ativos e renderizacao da tabela de mercado
