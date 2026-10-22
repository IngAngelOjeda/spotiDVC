import { describe, expect, it } from 'vitest';
import { normalize, parse, stripWakeWord, type Command } from '../src/commands';

const cases: [string, Command][] = [
  ['play', 'play'],
  ['reproducir', 'play'],
  ['dale', 'play'],
  ['seguir', 'play'],
  ['pausa', 'pause'],
  ['pausar', 'pause'],
  ['parar', 'pause'],
  ['stop', 'pause'],
  ['siguiente', 'next'],
  ['próxima', 'next'],
  ['próximo', 'next'],
  ['pasá', 'next'],
  ['anterior', 'previous'],
  ['atrás', 'previous'],
  ['volvé', 'previous'],
  ['subí', 'volumeUp'],
  ['más fuerte', 'volumeUp'],
  ['bajá', 'volumeDown'],
  ['más bajo', 'volumeDown'],
];

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

describe('parse', () => {
  it.each(cases)('«música %s» → %s', (phrase, command) => {
    expect(parse(`música ${phrase}`)).toBe(command);
  });

  it.each(cases)('sin tildes: «musica %s» → %s', (phrase, command) => {
    expect(parse(stripAccents(`música ${phrase}`))).toBe(command);
  });

  it.each(cases)('mayúsculas y puntuación: «Música, %s.» → %s', (phrase, command) => {
    expect(parse(`Música, ${phrase.toUpperCase()}.`)).toBe(command);
  });

  it.each(cases)('sin palabra de activación: «%s» → null', (phrase) => {
    expect(parse(phrase)).toBeNull();
  });

  it('acepta palabras después del comando', () => {
    expect(parse('música siguiente por favor')).toBe('next');
    expect(parse('música más fuerte un poco')).toBe('volumeUp');
  });

  it.each([
    '',
    'música',
    'musica   ',
    'pon la música siguiente',
    'me gusta la música',
    'música hola',
    'música pasado mañana',
    'música subir',
    'musical siguiente',
    'músicas pausa',
    'música más',
    'siguiente música',
  ])('no dispara nada: «%s»', (text) => {
    expect(parse(text)).toBeNull();
  });
});

describe('normalize', () => {
  it('saca tildes, mayúsculas y puntuación', () => {
    expect(normalize('  ¡Música,   PRÓXIMA!  ')).toBe('musica proxima');
  });
});

describe('stripWakeWord', () => {
  it('devuelve el resto de la frase', () => {
    expect(stripWakeWord('Música pausa')).toBe('pausa');
    expect(stripWakeWord('música')).toBe('');
    expect(stripWakeWord('hola música')).toBeNull();
  });
});
