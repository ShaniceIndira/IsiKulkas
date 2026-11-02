const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    const { imageBase64 } =
      await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({
          error:
            'imageBase64 tidak ditemukan.',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    const apiKey =
      Deno.env.get(
        'OCR_SPACE_API_KEY'
      );

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            'OCR API key belum dikonfigurasi.',
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    const formData =
      new FormData();

    formData.append(
      'apikey',
      apiKey
    );

    formData.append(
      'language',
      'eng'
    );

    formData.append(
      'isOverlayRequired',
      'false'
    );

    formData.append(
      'isTable',
      'true'
    );

    formData.append(
      'OCREngine',
      '2'
    );

    formData.append(
      'base64Image',
      imageBase64
    );

    const ocrResponse =
      await fetch(
        'https://api.ocr.space/parse/image',
        {
          method: 'POST',
          body: formData,
        }
      );

    const ocrData =
      await ocrResponse.json();

    if (!ocrResponse.ok) {
      console.error(
        'OCR.Space HTTP error:',
        ocrData
      );

      return new Response(
        JSON.stringify({
          error:
            'OCR service gagal merespons.',
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    if (
      ocrData?.IsErroredOnProcessing
    ) {
      console.error(
        'OCR processing error:',
        ocrData
      );

      return new Response(
        JSON.stringify({
          error:
            ocrData?.ErrorMessage?.[0] ||
            'OCR gagal membaca gambar.',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type':
              'application/json',
          },
        }
      );
    }

    const parsedResults =
      ocrData?.ParsedResults || [];

    const text =
      parsedResults
        .map(
          (result: any) =>
            result?.ParsedText ||
            ''
        )
        .join('\n')
        .trim();

    return new Response(
      JSON.stringify({
        success: true,
        text,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type':
            'application/json',
        },
      }
    );
  } catch (error) {
    console.error(
      'Receipt OCR function error:',
      error
    );

    return new Response(
      JSON.stringify({
        error:
          'Terjadi kesalahan saat memproses OCR.',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type':
            'application/json',
        },
      }
    );
  }
});