# Simulador de equalização do TRT-MG

Aplicação estática para simular agrupamentos de Varas do Trabalho com base nos casos novos de conhecimento de 2025 e na quantidade de juízes.

## Uso local

Na raiz do projeto, rode:

```bash
python3 -m http.server 8000 --directory dist
```

Abra [http://localhost:8000](http://localhost:8000). O simulador usa JavaScript no navegador e inclui uma base fictícia para demonstração. A aba **Base de varas** oferece o modelo de importação em Excel. CSV UTF-8 também é aceito.

## Critérios da simulação

- A média geral é a soma dos casos novos dividida pela soma dos juízes. A média de cada grupo usa o mesmo cálculo para as varas alocadas.
- Cada sugestão reúne pelo menos uma vara de alta e uma de baixa movimentação. A composição manual fica em montagem até atender às duas categorias e ao mínimo informado.
- O cenário aceita até nove grupos. A busca usa o intervalo informado de varas por grupo, com limite de 60.
- A faixa de referência é de 95% a 105% da média geral. A busca prioriza varas em grupos na faixa e minimiza os cruzamentos entre subregiões.
- A opção de manter juntas as varas da mesma cidade trata cada cidade como um bloco na sugestão e na alocação manual.

Os dados carregados e os cenários são guardados no navegador. O simulador exporta resultados em CSV e permite salvar e restaurar projetos em JSON.
