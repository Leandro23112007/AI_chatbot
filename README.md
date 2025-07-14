# Chatbot Llama - Web App

Este projeto é um chatbot web com IA, usando Flask e integração com modelos Ollama e Stable Diffusion.

## Pré-requisitos
- Python 3.8+
- [Ollama](https://ollama.com/) instalado e rodando localmente
- (Opcional) GPU para geração de imagens com Stable Diffusion

## Instalação
1. Clone o repositório:
   ```bash
   git clone <repo-url>
   cd chatbot llama
   ```
2. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
3. (Opcional) Baixe o modelo do Ollama:
   ```bash
   ollama pull llama3.1:8b
   ```

## Como rodar
```bash
python app.py
```
O app estará disponível em http://127.0.0.1:5000/

## Estrutura mínima do projeto
```
chatbot llama/
  app.py
  requirements.txt
  README.md
  templates/
    index.html
    ...
  static/
    ...
```

## Notas
- Os arquivos de dados (`chats_data.json`, `user_infos.json`, etc) são criados automaticamente.
- Para geração de imagens, é recomendado ter uma GPU e dependências extras do diffusers.
- Para dúvidas ou problemas, abra uma issue no repositório. 