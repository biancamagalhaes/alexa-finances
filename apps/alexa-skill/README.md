# Minha Carteira — Alexa Skill

Skill Custom em pt-BR para Echo Show 15. A API financeira é a fonte de verdade: ela calcula patrimônio, aportes, proventos e resultado. Esta Skill apenas recebe uma visão pronta, renderiza APL e faz respostas de voz qualitativas.

Os identificadores de perfil são fixos: `bianca`, `sergio` e `family`. O rótulo exibido para `family` é sempre **Família**.

## Garantias de privacidade

- Widget e tela de detalhe sempre iniciam com valores mascarados (`showValues: false`).
- O olho só altera o estado local do documento APL atual. Trocar de perfil ou abrir detalhes envia um novo `RenderDocument`, portanto volta mascarado.
- A voz só usa uma lista fechada de estados e classes (`positivo`, `negativo`, `estável`, ações, FIIs, Tesouro Direto e caixa). Nunca interpola texto recebido da API.
- Falha da API cai na resposta estática “Não consegui atualizar sua carteira agora…”, também sem números.
- O Data Store contém campos financeiros formatados para que o toque no olho possa revelá-los. Trate a Echo Show e as credenciais de publicação como dados sensíveis.

## Contrato da API financeira

Configure `PORTFOLIO_API_BASE_URL` e `PORTFOLIO_API_TOKEN` na Lambda. O token
deve ser exatamente o mesmo `API_BEARER_TOKEN` configurado na API; a Skill o
envia no header `X-API-Key` para atravessar proxies que não encaminham
`Authorization`.

`GET /v1/alexa/portfolio-view?profile=bianca|sergio|family` retorna `PortfolioView`, definido em `lambda/src/types/portfolio.ts`. Campos monetários formatados são usados exclusivamente no APL; cada campo sensível exige a variante mascarada correspondente.

`GET /v1/alexa/voice-status?profile=bianca|sergio|family` deve retornar somente:

```json
{
  "resultState": "positive",
  "hasIncomeThisMonth": true,
  "largestAllocationLabel": "ações",
  "updated": true
}
```

Não retorne moeda, percentuais, quantidades, preços, datas, tickers ou texto livre nesse endpoint. Mesmo assim, a Skill aplica uma allowlist antes de falar qualquer classe.

## Deploy da Skill e do widget

Estas etapas assumem uma Skill **self-hosted** em AWS Lambda e a conta Amazon da Echo Show 15 como conta de teste.

### Hospedagem gratuita pela Alexa

Para não usar uma conta AWS pessoal, crie uma nova Custom Skill com **Alexa-hosted (Node.js)**. O código pode ser enviado pelo menu **Code → Import Code** com:

```sh
cd apps/alexa-skill
npm run package:alexa-hosted
```

O arquivo gerado é `minha-carteira-alexa-hosted-code.zip`. Ele não contém nenhum token.

A Skill lê sua credencial pela tabela DynamoDB privada já criada pelo Alexa-hosted. Depois de configurar `ALEXA_API_TOKEN` no Discloud, insira uma única linha nessa tabela: `id` igual a `portfolio-api-config` e `apiToken` igual ao valor bruto de `ALEXA_API_TOKEN`. Essa chave só pode consultar `GET /v1/alexa/*`; ela não pode cadastrar nem alterar investimentos.

1. Instale e autentique o ASK CLI: `npm install --global ask-cli@2` e `ask configure`. No Alexa Developer Console, crie uma Custom Skill em `pt-BR` chamada “Minha Carteira”. Anote o Skill ID.

2. Na Skill, abra **Build → Interfaces** e ative **Alexa Presentation Language**, **Data Store** e **Data Store Packages**. Em seguida, salve e construa o modelo. O [`skill.json`](skill.json) já declara as três interfaces, a extensão `alexaext:datastore:10` e o pacote `MinhaCarteiraWidget`.

3. Exporte o pacote criado pelo Console para não substituir recursos remotos: `ask smapi export-package --skill-id <SKILL_ID> --stage development`. No diretório exportado, substitua:

   - `skill-package/skill.json` por [`skill.json`](skill.json);
   - `skill-package/interactionModels/custom/pt-BR.json` por [`models/pt-BR.json`](models/pt-BR.json);
   - `skill-package/dataStorePackages/MinhaCarteiraWidget/` por [`dataStorePackages/MinhaCarteiraWidget`](dataStorePackages/MinhaCarteiraWidget).

   Antes de publicar no Widget Gallery, complete os metadados visuais exigidos no `manifest.json` do pacote (ícone PNG 450×450 e preview 328×552 hospedados por HTTPS). Isso é separado da tela APL e não afeta a privacidade dos valores.

4. Na pasta `apps/alexa-skill`, instale e valide: `npm ci && npm run validate:json && npm run build && npm test`.

5. Crie uma função AWS Lambda Node.js 22.x e empacote a Skill. A Lambda deve usar `index.handler`.

   ```sh
   cd apps/alexa-skill
   npm run package:lambda
   ```

   O comando gera `minha-carteira-lambda.zip`, com `index.js` e as dependências
   de produção na raiz do arquivo. A pasta intermediária `deploy/` e o `.zip`
   são ignorados pelo Git.

   Faça upload de `minha-carteira-lambda.zip` à Lambda, adicione o gatilho **Alexa Skills Kit** e informe o Skill ID. No Developer Console, em **Build → Endpoint**, selecione a Lambda e informe o ARN da função. Configure `PORTFOLIO_API_BASE_URL` e `PORTFOLIO_API_TOKEN` como variáveis protegidas da Lambda; nunca as coloque no repositório.

6. No diretório do projeto ASK exportado, execute `ask deploy --target skill-metadata` e aguarde a construção do modelo. No Developer Console, habilite a Skill para a mesma conta Amazon configurada na Echo Show 15. Adicione “Minha Carteira” pelo painel de widgets da Echo Show.

O pacote usa `installStateChanges: INFORM`, então a instalação do widget gera `UsagesInstalled`. Para obter o ID do dispositivo no primeiro setup, defina temporariamente `ALEXA_WIDGET_ASSOCIATION_LOG_ENABLED=true` na Lambda, instale o widget e copie o `deviceId` skill-scoped do log protegido. Desative a flag logo depois; não mantenha identificadores pessoais em logs.

## Publicação diária no Data Store

O publicador em `publisher/src/data-store-publisher.js` é chamado pelo scheduler do backend depois que ele atualiza as cotações e calcula o `PortfolioView`. Por padrão é `dry-run`: ele constrói o payload, mas **não chama Login with Amazon nem a API da Alexa**.

No ambiente protegido do scheduler, configure:

```dotenv
ALEXA_DATA_STORE_MODE=live
LWA_CLIENT_ID=<skill-credentials-client-id>
LWA_CLIENT_SECRET=<skill-credentials-client-secret>
ALEXA_DATA_STORE_TARGET_TYPE=DEVICES
ALEXA_DATA_STORE_DEVICE_IDS=<device-id-copiado-do-UsagesInstalled>
ALEXA_DATA_STORE_ENDPOINT=https://api.amazonalexa.com
ALEXA_DATA_STORE_ATTEMPT_DELIVERY_MINUTES=60
```

Crie as credenciais LWA para a Skill no Amazon Developer Console e guarde `LWA_CLIENT_SECRET` apenas no gerenciador de segredos do scheduler. O publicador usa `client_credentials` com o escopo `alexa::datastore` e envia um `PUT_OBJECT` para `portfolio/summary` via `POST /v1/datastore/commands`. Para um alvo por usuário, troque `ALEXA_DATA_STORE_TARGET_TYPE=USER` e defina `ALEXA_DATA_STORE_USER_ID`; não defina IDs de outro Skill, pois eles são skill-scoped.

Para verificar o payload localmente sem rede, aponte `ALEXA_DATA_STORE_PAYLOAD_FILE` para um JSON `PortfolioView` válido e rode:

```sh
ALEXA_DATA_STORE_MODE=dry-run \
ALEXA_DATA_STORE_PAYLOAD_FILE=/caminho/portfolio-view.json \
npm run publish:datastore
```

O scheduler deve chamar esse publicador após a atualização pós-abertura e pós-fechamento. Consulte o retorno `results` quando estiver em modo `live`: uma resposta HTTP bem-sucedida não garante que um dispositivo offline recebeu o objeto; a Alexa pode enfileirar a entrega.

## Testes

```sh
npm run validate:json
npm run build
npm test
```

Os testes cobrem: resposta de voz sem números, bloqueio de interpolação de labels arbitrários da API, erro de API qualitativo, retorno ao estado mascarado para `select-profile`/`show-details`, `family` → `Família`, e o publicador em `dry-run` sem chamada de rede. O único teste em modo `live` injeta um `fetch` falso; nenhuma credencial ou endpoint real é usado.

Checklist manual na Echo Show 15:

1. Abra o widget: os valores devem ser `••••••`.
2. Toque no olho: os valores atuais aparecem somente no documento aberto.
3. Toque em Bianca, Sergio ou Família e depois em “Ver detalhes”: a nova tela deve voltar para `••••••`.
4. Pergunte “Alexa, qual foi meu resultado este mês?”: a resposta deve indicar apenas positivo, negativo ou estável e orientar o toque na tela.
5. Indisponibilize a API temporariamente e repita a pergunta: a mensagem de falha não pode incluir valores, data, ticker ou detalhes técnicos.
