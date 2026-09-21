# Sistema de Detecção de Fadiga

Projeto React (Vite) que usa um modelo do **Teachable Machine** para detectar fadiga
pela câmera. Se o motorista ficar **mais de 5 segundos em estado de fadiga**, um
**alarme sonoro** é disparado e a ocorrência é registrada no chat da "Sala de Controle"
(fictícia) com o horário do evento.

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (ex.: `http://localhost:5173`) e clique em
**"Ligar câmera"**. Permita o acesso à câmera quando o navegador pedir.

## Como funciona

- O modelo (`public/model/`) tem as classes **`Fatigue`** e **`Active`**.
- A cada frame o app calcula a probabilidade de fadiga.
- Se a probabilidade de `Fatigue` ficar **≥ 70%** de forma contínua por **5 segundos**,
  o alarme toca e a mensagem é enviada para o chat.
- Ao voltar ao estado "Active", o alarme para automaticamente.

## Onde ajustar

No arquivo `src/App.jsx`, no topo:

```js
const FATIGUE_LABEL = 'Fatigue'   // nome da classe (do metadata.json)
const FATIGUE_THRESHOLD = 0.7     // sensibilidade (0 a 1)
const ALERT_AFTER_MS = 5000       // tempo até disparar o alarme (ms)
```

## Observações

- As bibliotecas do TensorFlow.js e Teachable Machine são carregadas via CDN
  (ver `index.html`), pois o pacote npm exige uma versão antiga e fixa do TensorFlow.
  Por isso é necessário estar **online** na primeira execução.
- O alarme é gerado por código (Web Audio API), não precisa de arquivo `.mp3`.
- A câmera só funciona em `localhost` ou `https` (exigência do navegador).
