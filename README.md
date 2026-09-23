# Alexa Finances

Carteira familiar para a Echo Show 15, com perfis Bianca, Sergio e Família.

## Decisões do MVP

- A API é responsável por todos os cálculos financeiros.
- APL apenas recebe projeções prontas para exibição.
- Valores começam ocultos e só aparecem ao tocar no ícone de olho.
- A Skill nunca fala valores, percentuais, quantidades ou preços.
- Cotações são atualizadas após a abertura e após o fechamento do mercado.
- Operações são enviadas por API: posição inicial, compra, venda, aporte, retirada e provento.
- Proventos serão cadastrados manualmente no MVP.

## Dados de demonstração

Enquanto a integração estiver em desenvolvimento, o arquivo SQLite pode usar
somente os ativos fictícios `DEMO3`, `DEMO11` e `TD-DEMO-IPCA-2035`:

```sh
npm run migrate:dev --workspace=@alexa-finances/database
npm run seed:demo --workspace=@alexa-finances/database
```

Quando chegar a hora de cadastrar a carteira real, a estrutura do banco e os
perfis permanecem. Remova apenas os registros de demonstração com a confirmação
explícita abaixo; o comando não seleciona registros reais.

```sh
CONFIRM_DEMO_RESET=clear-demo-data npm run reset:demo --workspace=@alexa-finances/database
```

## Estrutura

- `apps/api`: API HTTP e integração de persistência.
- `apps/alexa-skill`: Skill Alexa e documentos APL.
- `packages/database`: modelo e acesso ao banco.
- `packages/portfolio-domain`: cálculos financeiros puros.
