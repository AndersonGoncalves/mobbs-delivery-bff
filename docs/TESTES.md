# Testes do BFF — terminal e painel Testing do VS Code

O BFF usa **Jest + ts-jest**; a retaguarda usa **Vitest** e o app usa **Dart/Flutter**.
Os três aparecem no mesmo painel Testing, mas **cada framework precisa de seu adaptador**.
Instalar Vitest não descobre os arquivos Jest `*.spec.ts` do BFF.

Configuração do runner: [jest.config.js](../jest.config.js).
Testes ficam em `src/**/*.spec.ts`, junto ao código. Não precisa compilar antes,
subir Mongo/BFF, executar Docker, fornecer service account ou criar dados para testes unitários.
As dependências externas são mockadas. Não use credenciais reais para testar.

Para rodar o servidor (não os testes), veja
[RUN-BFF.md](../../mobbs-delivery-app/rodar-local/RUN-BFF.md).

## 1. Preparar dependências

```bash
cd /home/anderson/DevPrograms/Projetos/delivery/mobbs-delivery-bff
npm ci
```

Node 20.19+ ou uma versão compatível posterior. Isso instala o Jest local do lockfile.

## 2. Fazer aparecer ao lado de Flutter e Vitest

### 2.1 Instalar a extensão certa

No VS Code, abra **Extensions** (Ctrl+Shift+X), pesquise pelo identificador
**`orta.vscode-jest`** e instale **Jest**, de Orta.

Link: <https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest>

Se preferir terminal, a instalação explícita é:

```bash
code --install-extension Orta.vscode-jest
```

Instale/habilite no **perfil/janela atual**. Em WSL, SSH ou Dev Container, instale também no
ambiente remoto onde a pasta do BFF está aberta. Ter uma extensão instalada no host não
garante que esteja habilitada no remoto.

Não confunda com Jest Runner: o objetivo aqui é a extensão Jest que integra o **Testing** nativo.

### 2.2 Abrir a pasta do BFF no workspace

Para ver os projetos juntos, o workspace deve incluir estas pastas como raízes:

```text
mobbs-delivery-app
mobbs-building-blocks
mobbs-delivery-web
mobbs-delivery-bff
```

Use **File → Add Folder to Workspace…** e selecione `mobbs-delivery-bff` se não estiver na lista.
Abrir só a pasta do app não inclui automaticamente um repositório irmão.
O workspace local `delivery/mobbs-delivery.code-workspace`, se usado, já deve listar essas raízes.
Salve o workspace e autorize a confiança somente se você confia no código.

### 2.3 Usar a configuração versionada do projeto

O BFF já contém:

- [.vscode/extensions.json](../.vscode/extensions.json): recomenda o adaptador Jest.
- [.vscode/settings.json](../.vscode/settings.json):

```json
{
  "jest.jestCommandLine": "npm test -- --runInBand",
  "jest.runMode": "on-demand"
}
```

A extensão usa a raiz **desta pasta BFF** e encontra `jest.config.js` automaticamente.
Não configure `jest.rootPath` para a raiz do Flutter nem uma configuração global apontando a
outro repositório. O modo **on-demand** só executa quando você clica: não dispara toda a suíte
ao salvar. `--runInBand` reduz concorrência e consumo de memória.

Se você tinha `jest.enable: false` ou um `jest.disabledWorkspaceFolders` excluindo o BFF nas
configurações pessoais/workspace, remova essa exclusão. Configurações antigas podem impedir
o runner de iniciar apesar destes arquivos.

### 2.4 Descobrir e executar pela interface

1. Abra a paleta (Ctrl+Shift+P) e execute **Developer: Reload Window**, se acabou de instalar.
2. Abra **Testing** (ícone de frasco, como na imagem).
3. Use **Refresh Tests** (atualizar testes) na barra do painel. Se o Jest estiver parado,
   procure `Jest` na paleta e use o comando de iniciar o runner disponível na sua versão.
4. Deve surgir a árvore Jest do BFF, além das árvores Dart/Flutter e Vitest.
5. Expanda `src → modules → suppliers → presentation → suppliers.controller.spec.ts`.
6. Clique no **▶ do arquivo** para rodar só essa suíte. Depois pode executar um `describe`,
   um teste específico ou a árvore inteira do BFF.
7. Clique em **Debug Test** para parar em breakpoints.

Não use o ▶ do topo do painel se quiser só BFF: **Run All Tests** também pode iniciar
Flutter e Vitest, deixando a máquina muito mais carregada.

## 3. Se a árvore Jest não aparecer

Faça nesta ordem, sem trocar Jest por Vitest:

1. Confirme que `mobbs-delivery-bff` está aberto como raiz e que a extensão está habilitada
   na janela/perfil/ambiente corretos.
2. Na raiz do BFF rode:

   ```bash
   npm test -- --runInBand --listTests
   ```

   Deve listar caminhos `*.spec.ts`. Se esse comando falhar, resolva o erro do terminal
   (por exemplo, rode `npm ci` se falta Jest). Sem descoberta pelo CLI, o adaptador também falha.
3. Abra **View → Output** e escolha o canal **Jest** correspondente ao BFF. Confira erros
   de raiz, comando e Node. `MODULE_NOT_FOUND` costuma indicar dependências ausentes ou raiz errada.
4. Remova configurações antigas como caminho absoluto de outra máquina e recarregue a janela.
5. Para isolar workspace, abra somente a pasta BFF em outra janela e confira o Testing.
   Se funcionar isolado, revise as configurações do workspace multi-root, não os testes.

| Sintoma | Ação |
|---|---|
| Só aparecem Flutter e Vitest | Instale/habilite `orta.vscode-jest` e inclua a pasta BFF no workspace |
| Extensão instalada, mas nenhum teste | Confirme Trust, perfil/remoto, configurações de exclusão e canal Output/Jest |
| Jest tenta rodar na pasta do app | Remova `jest.rootPath` global errado; use configuração de pasta do BFF |
| Terminal descobre, mas VS Code não | Problema do adaptador/workspace; não precisa subir Mongo nem recompilar o BFF |
| Lentidão com todos os projetos | Rode ▶ na árvore/arquivo BFF, não Run All; mantenha `--runInBand` |

## 4. Comandos de testes no terminal

Todos a partir da raiz `mobbs-delivery-bff`:

```bash
npm test -- --runInBand
npm test -- --runInBand src/modules/orders
npm test -- --runInBand --runTestsByPath src/modules/suppliers/presentation/suppliers.controller.spec.ts
npm test -- --runInBand -t "AC-1"
npm test -- --runInBand --watch
npm test -- --runInBand --verbose
npm test -- --runInBand --listTests
```

`--watch` é contínuo; Ctrl+C para sair. `--runTestsByPath` seleciona o arquivo exato.
Não existe `melos` para este repositório Node.

Cobertura:

```bash
npm test -- --runInBand --coverage
```

Saída HTML em `coverage/lcov-report/index.html`. Não é preciso instalar outro provider para Jest.

Gates locais:

```bash
npm run lint
npm test -- --runInBand
npm run build
```

## Resumo rápido — Testing igual ao app/web

1. Instale **Jest (`orta.vscode-jest`)** na janela/ambiente correto.
2. Adicione a pasta **mobbs-delivery-bff** ao workspace.
3. No terminal do BFF:

   ```bash
   cd /home/anderson/DevPrograms/Projetos/delivery/mobbs-delivery-bff
   npm ci
   npm test -- --runInBand --listTests
   ```

4. Recarregue a janela, abra **Testing**, atualize os testes e clique no **▶ da árvore Jest/BFF**.
5. Prova rápida no terminal, sem API/banco:

   ```bash
   npm test -- --runInBand --runTestsByPath src/modules/suppliers/presentation/suppliers.controller.spec.ts
   ```
