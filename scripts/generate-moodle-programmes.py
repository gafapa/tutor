"""Generate clearly synthetic programme PDFs for the authorized Moodle test courses."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

OUTPUT = Path('output/pdf')
OUTPUT.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Programme', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('ProgrammeBold', 'C:/Windows/Fonts/arialbd.ttf'))
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='ProgrammeBody', fontName='Programme', fontSize=11, leading=16, spaceAfter=11, alignment=TA_LEFT))
styles.add(ParagraphStyle(name='ProgrammeTitle', fontName='ProgrammeBold', fontSize=20, leading=25, spaceAfter=17, textColor=colors.HexColor('#245b50')))
styles.add(ParagraphStyle(name='ProgrammeHeading', fontName='ProgrammeBold', fontSize=12, leading=16, spaceBefore=10, spaceAfter=6))
PROGRAMMES = {
    'mathematics': ('Matemáticas', [
        ('Fracciones y números racionales', 'Comparar, simplificar y operar con fracciones justificando el denominador común.', 'Fracciones equivalentes; suma y resta; producto y cociente; representación en la recta.', 'Explica con un ejemplo por qué se necesita un denominador común y comprueba el resultado con una estimación.', 'Representar 2/3; sumar 1/2 y 1/3; localizar y explicar un error al sumar denominadores.'),
        ('Proporcionalidad y porcentajes', 'Resolver situaciones de proporcionalidad y explicar a qué cantidad se aplica un porcentaje.', 'Razón y proporción; regla de tres; porcentajes; descuentos e incrementos sucesivos.', 'Identifica la cantidad de referencia, organiza los datos y justifica si dos descuentos sucesivos equivalen a sumar porcentajes.', 'Calcular el 15% de 80; comparar dos ofertas; explicar un incremento seguido de un descuento.'),
        ('Álgebra y ecuaciones', 'Traducir relaciones a lenguaje algebraico y resolver ecuaciones conservando la igualdad.', 'Expresiones algebraicas; términos semejantes; ecuaciones de primer grado; comprobación por sustitución.', 'Explica cada transformación de una ecuación y verifica la solución sustituyéndola en la expresión inicial.', 'Simplificar 3x + 2x; resolver 2x + 3 = 11; modelar una compra con una cantidad desconocida.'),
        ('Datos, probabilidad y proyecto', 'Interpretar datos y distinguir un resultado observado de una predicción probabilística.', 'Tablas y gráficos; media y mediana; sucesos; probabilidad simple; lectura crítica de resultados.', 'Selecciona una representación adecuada, calcula una medida resumen y explica sus límites sin confundir frecuencia con certeza.', 'Representar una encuesta ficticia; comparar media y mediana; justificar una probabilidad al lanzar un dado.'),
    ]),
    'networks': ('Redes', [
        ('Bits, unidades y representación binaria', 'Convertir cantidades entre representaciones y distinguir bits de bytes.', 'Bits y bytes; potencias de dos; binario y decimal; unidades de almacenamiento y transmisión.', 'Muestra los pasos de una conversión binaria y comprueba la coherencia de las unidades de un cálculo.', 'Convertir 1010 a decimal; expresar 32 con potencias de dos; estimar un tiempo de descarga.'),
        ('Ethernet, IPv4 y servicios de red', 'Describir cómo cooperan los dispositivos y servicios de una red local.', 'Ethernet; dirección MAC; dirección IPv4; puerta de enlace; DHCP; DNS.', 'Distingue la función de dirección, puerta de enlace y DNS al explicar una comunicación y propone una comprobación pertinente.', 'Identificar una configuración; explicar DHCP; separar un fallo de conectividad de un fallo DNS.'),
        ('Máscaras y subnetting IPv4', 'Relacionar una máscara con la capacidad de una subred y justificar el cálculo de sus rangos.', 'Prefijos CIDR; bits de red y host; dirección de red; difusión; rangos de hosts.', 'Calcula red, difusión y rango utilizable de una subred sencilla y explica por qué se reservan determinadas direcciones.', 'Interpretar /27; calcular el tamaño de bloque; comprobar si dos equipos pertenecen a la misma subred.'),
        ('Diagnóstico y diseño de una red pequeña', 'Planificar una red sencilla y diagnosticar fallos siguiendo hipótesis comprobables.', 'Inventario; topología; direccionamiento; pruebas de conectividad; documentación y diagnóstico.', 'Propone un plan coherente, registra evidencias y distingue una hipótesis de un resultado confirmado.', 'Diseñar una red de aula; ordenar comprobaciones; justificar el siguiente paso ante un fallo simulado.'),
    ]),
}

def footer(canvas, document):
    canvas.setFont('Programme', 9)
    canvas.setFillColor(colors.HexColor('#536474'))
    canvas.drawString(48, 30, 'Tutor Local - material sintético de pruebas - no es una programación oficial')
    canvas.drawRightString(A4[0] - 48, 30, f'Página {document.page}')

for key, (subject, units) in PROGRAMMES.items():
    story = []
    for index, (title, objective, contents, criterion, practice) in enumerate(units, 1):
        if index > 1:
            story.append(PageBreak())
        story.append(Paragraph(f'{subject}: programación de pruebas', styles['ProgrammeTitle']))
        story.append(Paragraph('Documento sintético para validar importación, relaciones y planificación en Tutor Local. Códigos propios de prueba; no representan un currículo normativo.', styles['ProgrammeBody']))
        story.append(Paragraph(f'U{index}. {title}', styles['ProgrammeTitle']))
        for heading, body in [
            ('Objetivo de la unidad', objective),
            (f'S{index}. Saberes y contenidos', contents),
            (f'CE{index}. Criterio de evaluación de prueba', criterion),
            (f'COMP{index}. Competencia de prueba', 'Explicar decisiones con vocabulario preciso, comprobar resultados y revisar errores con autonomía.'),
            ('Temporalización orientativa', 'Duración prevista: 2 semanas. El alumno debe revisar y ajustar las fechas; este documento no fija plazos oficiales de Moodle.'),
            ('Actividades y variedad de práctica', practice),
            ('Metodología y seguimiento', 'Comenzar con un intento propio. Usar ejemplos, pistas progresivas y una revisión razonada. Relacionar el trabajo con las actividades y comentarios publicados en Moodle. La práctica personal no produce una calificación del centro.'),
            ('Apoyo y evaluación', 'Adaptar el vocabulario y el tamaño de cada paso al curso. Registrar el procedimiento, las ayudas utilizadas y una breve reflexión. Comparar el resultado con el criterio y con las evidencias disponibles; no inferir dominio a partir de una única respuesta.'),
        ]:
            story.append(Paragraph(heading, styles['ProgrammeHeading']))
            story.append(Paragraph(body, styles['ProgrammeBody']))
    path = OUTPUT / f'{key}-programme-test.pdf'
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=48, rightMargin=48, topMargin=42, bottomMargin=48, title=f'{subject} - synthetic programme fixture', author='Tutor Local').build(story, onFirstPage=footer, onLaterPages=footer)
    print(path)
