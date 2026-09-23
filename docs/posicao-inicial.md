# Posição inicial

Registre uma linha por ativo na data em que o acompanhamento começar. A API usará a cotação de fechamento desse dia como primeiro snapshot; a evolução mensal passa a valer dali em diante.

Para cada ação ou FII, informe:

```text
Perfil: Bianca ou Sergio
Tipo: ação ou FII
Ticker: exemplo PETR4 ou HGLG11
Quantidade: exemplo 10
Preço médio: exemplo 32,50
```

Para cada título do Tesouro, informe:

```text
Perfil: Bianca ou Sergio
Título: exemplo Tesouro IPCA+ 2035
Tipo: Selic, Prefixado ou IPCA+
Vencimento: exemplo 15/05/2035
Quantidade: exemplo 0,35
Preço médio: exemplo 2.418,70
```

Se houver dinheiro disponível que deva contar no patrimônio, informe também:

```text
Perfil: Bianca ou Sergio
Saldo inicial em caixa: exemplo 500,00
```

Não envie senhas, chaves de corretora ou dados bancários.
