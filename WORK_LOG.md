# Registro de alteração — 23/11/2026

Correção do bloqueio da interface ao repetir a busca com outro limiar.

1. Inspeção do fluxo de sugestão e da busca de restrições: o cálculo síncrono ocupava a linha de execução da interface; o limite de nós não limitava o tempo de bloqueio.
2. Testes escritos antes da implementação: execução separada, resultado, falha seguida de nova tentativa, tempo limite, cancelamento e erro. Primeira execução falhou pela ausência do módulo a implementar.
3. Implementação do cliente e do Web Worker: mantém o algoritmo e suas restrições, isola o cálculo, encerra recursos por tentativa e impõe limite de 20 segundos. Não há fallback de cálculo síncrono.
4. Integração do formulário: mensagem de processamento, parâmetros temporariamente desabilitados, cancelamento ao fechar e liberação após erro. O salvamento acontece somente após sucesso.
5. Validação: 14 testes passaram, incluindo worker real com falha em 1 km seguida de sucesso em 250 km. A mesma sequência foi conferida no navegador com quatro varas de teste e persistência simulada; nenhuma alteração na base compartilhada foi feita durante a validação. Sintaxe e whitespace conferidos.
6. Limpeza dos dois arquivos temporários de validação antes do empacotamento. Publicação usa o fluxo do site existente e preserva seu acesso.

As ferramentas crapper, dryer e mutator não estão disponíveis nesta sessão. Foram usados testes comportamentais e revisão do diff. A base real do usuário não foi carregada nesta validação; não foi comprovada a viabilidade de agrupamento dessa base em 250 km.


## Sugestões parciais por distância — 23/11/2026

1. Atualizados os testes para permitir resultado parcial, ausência de grupos e cidades sem coordenadas ou acima do tamanho máximo. A execução anterior à implementação falhou nos três comportamentos alterados.
2. O modo por distância passou a usar diretamente os grupos geográficos encontrados, sem a busca de cobertura integral. Mantidas as restrições de distância, cidade inteira, tamanho e alta/baixa movimentação. O modo regional continua exigindo cobertura completa.
3. Incluídos contagem no resultado e aviso persistente na página para as varas sem agrupamento, com orientação para o filtro existente. Atualizados os textos do formulário e da metodologia.
4. Quinze testes passaram, incluindo o worker real e a nova tentativa após resultado vazio; sintaxe e whitespace conferidos.
5. Conferido no navegador com quatro varas de teste: em 25 km, um grupo com duas varas foi aplicado; o aviso identificou duas sem agrupamento e o filtro exibiu somente essas duas. Persistência simulada, sem alterar a base compartilhada. Arquivos temporários removidos antes de empacotar.


## Máximo de agrupamentos configurável — 23/11/2026

1. Escritos quatro testes antes da implementação, confirmando falhas do limite fixo: cobertura com dez cidades, cenário regional, persistência e validação de entrada.
2. Adicionado parâmetro por cenário `maxGroups`, padrão 9, inteiro entre 1 e 100. O valor orienta os algoritmos, limites de capacidade, criação manual, contador e duplicação. Arquivos antigos permanecem compatíveis.
3. Incluído o campo no formulário e no pedido enviado ao worker. Teste com worker real verifica limites de um e dois grupos.
4. Dezenove testes passaram, com verificação de sintaxe e whitespace. Base sintética com dez cidades: 18/20 varas com nove grupos; 20/20 com dez. Mantidas as regras de distância e a alocação parcial nesse modo.
5. No navegador, conferidos padrão 9, geração com máximo 12, contador “2 de 12” e reabertura do formulário preservando 12. Usada base de teste com persistência simulada; arquivos temporários removidos antes do empacotamento.

## Sincronização com GitHub — 23/11/2026

Publicação solicitada explicitamente pelo usuário. Conferido o estado de `origin/main` e preservados os arquivos próprios do repositório. Sincronizados os arquivos da versão publicada: filtro de varas sem grupo, sugestões parciais por distância, cálculo em worker e máximo de grupos parametrizável. Os 19 testes, a sintaxe do aplicativo e a verificação de whitespace passaram antes do commit e envio.
