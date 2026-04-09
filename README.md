# Bot de finanzas personales

Bot de Telegram para registrar movimientos financieros en Google Sheets a partir de:

- Audios o notas de voz con compras o ingresos narrados.
- PDFs con estados de cuenta bancarios.

La aplicacion usa:

- `Telegraf` para Telegram.
- `OpenAI` para transcripcion de audio y extraccion estructurada.
- `Google Sheets API` para guardar los movimientos.

## Flujo

1. Envias una nota de voz o un audio al bot.
2. El bot descarga el archivo desde Telegram.
3. OpenAI transcribe el audio.
4. Un modelo extrae la estructura del movimiento: monto, concepto, fecha y metodo de pago.
5. El sistema agrega una fila en Google Sheets.

Para PDFs:

1. Envias un `PDF` al bot.
2. El bot lo sube a OpenAI.
3. Un modelo extrae los movimientos del estado de cuenta.
4. El sistema agrega varias filas a la hoja de calculo.

## Estructura de la hoja

La implementacion agrega filas con este orden de columnas:

`captured_at`, `source`, `telegram_file_name`, `transaction_date`, `posted_date`, `description`, `merchant`, `signed_amount`, `currency`, `movement_type`, `payment_method`, `account_name`, `category`, `confidence`, `raw_text`

Puedes crear una hoja llamada `Movimientos` o cambiar el rango en `GOOGLE_SHEETS_RANGE`.

## Configuracion

1. Instala dependencias:

```bash
npm install
```

2. Copia el archivo de ejemplo:

```bash
copy .env.example .env
```

3. Completa estas variables:

- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON` o `GOOGLE_SERVICE_ACCOUNT_FILE`

## Google Sheets

La app esta preparada para usar una cuenta de servicio de Google, que suele ser la opcion mas simple para automatizacion backend.

Pasos:

1. En Google Cloud, habilita la Google Sheets API.
2. Crea una cuenta de servicio.
3. Descarga la llave JSON o copia su contenido.
4. Comparte tu hoja de calculo con el correo de la cuenta de servicio como editor.
5. Coloca las credenciales en `GOOGLE_SERVICE_ACCOUNT_JSON` o en un archivo y apunta `GOOGLE_SERVICE_ACCOUNT_FILE`.

Referencia oficial usada:

- [Guia oficial de Google Sheets para Node.js](https://developers.google.com/workspace/sheets/api/quickstart/nodejs)

## Telegram

Por defecto el proyecto corre en `polling`, util para desarrollo local:

```bash
npm run dev
```

Si quieres desplegarlo como servicio siempre activo, puedes usar `webhook`:

- `TELEGRAM_MODE=webhook`
- `TELEGRAM_WEBHOOK_DOMAIN=https://tu-dominio.com`
- `TELEGRAM_WEBHOOK_PATH=/telegram/webhook`

## OpenAI

La implementacion usa:

- Transcripcion de audio con el modelo configurado en `OPENAI_TRANSCRIPTION_MODEL`.
- Salidas estructuradas para convertir voz y PDFs en JSON confiable.
- Entrada de PDF por medio de la Files API y Responses API.

Referencias oficiales usadas:

- [Guia de transcripcion de audio](https://platform.openai.com/docs/guides/speech-to-text?lang=javascript)
- [Guia de salidas estructuradas](https://platform.openai.com/docs/guides/structured-outputs?lang=javascript)
- [Guia de entrada de archivos PDF](https://platform.openai.com/docs/guides/pdf-files)

## Seguridad importante

El token de Telegram no debe quedarse expuesto en mensajes, commits ni `.env.example`.

Como compartiste un token en esta conversacion, te recomiendo **rotarlo en BotFather** antes de poner este bot en produccion y luego guardar el nuevo valor solo en tu `.env`.

## Suposiciones de esta primera version

- Los audios describen un solo movimiento por mensaje.
- Los PDFs corresponden a estados de cuenta relativamente bien escaneados o digitales.
- Los montos se guardan negativos para gastos y positivos para ingresos.
- Si una fecha no viene clara en el audio, se usa la fecha actual del servidor.

## Proximos pasos recomendados

- Anadir deduplicacion para PDFs.
- Clasificacion automatica por categorias propias.
- Confirmacion interactiva en Telegram antes de guardar.
- Soporte para varias hojas por cuenta o banco.
