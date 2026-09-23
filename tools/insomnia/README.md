# Insomnia

Importe `alexa-finances.insomnia.json` no Insomnia em **Create > Import > From File**.

Com a API local em execução, a variável `base_url` já aponta para
`http://127.0.0.1:3000`. Copie o valor de `API_BEARER_TOKEN` do arquivo local
`apps/api/.env` para a variável `api_bearer_token` antes de chamar qualquer
request de carteira ou Alexa. Apenas `Health` não exige autenticação.

Para testar posição inicial, compra, venda ou provento, execute primeiro
**Carteira > Listar ativos**, copie o `id` de um ativo e defina-o na variável
de ambiente `instrument_id`. Cada exemplo usa uma `operation_key` diferente;
altere-a para criar um novo lançamento ou repita a mesma para testar a
idempotência.

As requests que fazem `POST` alteram somente o SQLite local. Não execute a
request **Criar ativo de teste** se não quiser persistir esse ativo: o MVP ainda
não expõe uma rota para apagar ativos ou operações.
