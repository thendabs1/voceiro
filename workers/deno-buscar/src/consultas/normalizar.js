const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const olId = key => String(key || '').split('/').pop();
const portada = id => id > 0 ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : null;
const poster = ruta => ruta ? `https://image.tmdb.org/t/p/w500${ruta}` : null;
const anio = fecha => /^\d{4}/.test(fecha || '') ? Number(fecha.slice(0, 4)) : null;
const candidato = (id, titulo, detalle, year, imagen, enlace) => ({ id, titulo, detalle, anio: year, imagen, enlace });

export function libros(datos) {
  const vistos = new Set();
  return datos.docs.filter(d => {
    // Distintas obras con título y autor iguales son duplicados de catálogo.
    const autores = (d.author_key?.length ? d.author_key : d.author_name || []).map(norm).sort();
    const clave = `${norm(d.title)}|${autores.length ? autores.join('|') : d.key}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave); return true;
  }).map(d => candidato(`openlibrary:${olId(d.key)}`, d.title, (d.author_name || []).join(', '),
    d.first_publish_year || null, portada(d.cover_i), `https://openlibrary.org${d.key}`));
}

export function autores(datos) {
  return datos.docs.map(d => candidato(`openlibrary:${olId(d.key)}`, d.name,
    [d.birth_date, d.death_date].filter(Boolean).join(' – '), anio(d.birth_date),
    null, `https://openlibrary.org/authors/${olId(d.key)}`));
}

export function libro(obra, meta) {
  return {
    titulo: obra.title,
    autores: (meta?.author_key || []).map((id, i) => ({ id: `openlibrary:${id}`, nombre: meta.author_name?.[i] || null })),
    primer_anio: meta?.first_publish_year || anio(obra.first_publish_date),
    ediciones: meta?.edition_count ?? null, idiomas: meta?.language || [],
    portada: portada(obra.covers?.[0] || meta?.cover_i),
  };
}

export function autor(datos, obras) {
  const vistos = new Set();
  return {
    nombre: datos.name, nacimiento: datos.birth_date || null, fallecimiento: datos.death_date || null,
    foto: datos.photos?.[0] > 0 ? `https://covers.openlibrary.org/a/id/${datos.photos[0]}-L.jpg` : null,
    obras_principales: obras.entries.filter(o => {
      const clave = norm(o.title);
      if (vistos.has(clave)) return false;
      vistos.add(clave); return true;
    }).slice(0, 10).map(o => ({ id: `openlibrary:${olId(o.key)}`, titulo: o.title })),
  };
}

export function audiovisuales(datos, tipo) {
  const ruta = tipo === 'pelicula' ? 'movie' : 'tv';
  return datos.results.map(d => candidato(`tmdb:${ruta}/${d.id}`, d.title || d.name,
    d.original_title || d.original_name || '', anio(d.release_date || d.first_air_date),
    poster(d.poster_path), `https://www.themoviedb.org/${ruta}/${d.id}`));
}

export function audiovisual(d, tipo) {
  const serie = tipo === 'serie';
  const creditos = serie ? d.aggregate_credits : d.credits;
  const proveedores = d['watch/providers']?.results?.ES || {};
  return {
    titulo: d.title || d.name, titulo_original: d.original_title || d.original_name,
    anio: anio(d.release_date || d.first_air_date),
    ...(serie ? { temporadas: d.number_of_seasons } : { duracion: d.runtime }),
    generos: (d.genres || []).map(g => g.name),
    ...(serie ? { creacion: (d.created_by || []).map(p => p.name) }
      : { direccion: (creditos?.crew || []).filter(p => p.job === 'Director').map(p => p.name) }),
    reparto: (creditos?.cast || []).slice(0, 8).map(p => ({ nombre: p.name, personaje: p.character || p.roles?.map(r => r.character).join(', ') || '' })),
    sinopsis: d.overview || '', poster: poster(d.poster_path),
    donde_ver: Object.entries({ flatrate: 'suscripcion', rent: 'alquiler', buy: 'compra' })
      .flatMap(([campo, modo]) => (proveedores[campo] || []).map(p => ({ nombre: p.provider_name.trim(), modo }))),
    enlace_donde_ver: proveedores.link || null, atribucion: 'JustWatch',
  };
}

export function clasificacion(d, competicion, deporte) {
  const grupos = [];
  let temporada = d.season?.displayName || d.season?.year || null;
  function recorrer(nodo) {
    if (nodo.standings) {
      const s = nodo.standings;
      temporada ||= s.seasonDisplayName || s.season || null;
      const filas = (s.entries || []).map(e => {
        const stats = Object.fromEntries((e.stats || []).map(s => [s.name, s.value ?? null]));
        return {
          pos: stats.rank ?? stats.playoffSeed ?? null,
          equipo: e.team?.displayName || e.athlete?.displayName || e.team?.name || e.athlete?.name,
          pj: stats.gamesPlayed ?? (stats.wins != null && stats.losses != null ? stats.wins + stats.losses + (stats.ties || 0) : null),
          g: stats.wins ?? null, e: stats.ties ?? null, p: stats.losses ?? null,
          // En baloncesto `points` es la diferencia de puntos: se ordena por victorias.
          pts: stats.championshipPts ?? (deporte === 'basketball' ? null : stats.points) ?? null,
        };
      }).sort((a, b) => (a.pos ?? Infinity) - (b.pos ?? Infinity));
      if (filas.length) grupos.push({ nombre: nodo.name || s.displayName, filas });
    }
    for (const hijo of nodo.children || []) recorrer(hijo);
  }
  recorrer(d);
  return { competicion, temporada, grupos };
}

export function resultados(d, competicion) {
  return { competicion, temporada: d.season?.year || null, partidos: (d.events || []).flatMap(e =>
    (e.competitions || []).flatMap(c => {
      const local = c.competitors?.find(p => p.homeAway === 'home');
      const visitante = c.competitors?.find(p => p.homeAway === 'away');
      if (!local || !visitante) return [];
      const status = c.status?.type || e.status?.type;
      const estado = status?.state === 'in' ? 'en_juego' : status?.completed || status?.state === 'post' ? 'final' : 'programado';
      const score = p => p.score?.displayValue ?? p.score;
      return [{ inicio: c.date || e.date, estado, local: local.team.displayName, visitante: visitante.team.displayName,
        marcador: estado === 'programado' ? null : { local: score(local) ?? null, visitante: score(visitante) ?? null } }];
    })) };
}

export function paginas(d, idioma) {
  return d.pages.map(p => candidato(`wikipedia:${p.key}`, p.title, p.description || '', null,
    p.thumbnail?.url ? new URL(p.thumbnail.url, `https://${idioma}.wikipedia.org`).href : null,
    `https://${idioma}.wikipedia.org/wiki/${encodeURIComponent(p.key)}`));
}

export function contexto(d, entidad) {
  const claims = entidad?.claims || {};
  const propiedad = p => claims[p]?.filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(v => typeof v === 'string') || [];
  return {
    titulo: d.title, resumen: d.extract || '', imagen: d.thumbnail?.source || null,
    enlace: d.content_urls?.desktop?.page || null, qid: d.wikibase_item || null,
    ids: { tmdb: [...propiedad('P4947'), ...propiedad('P4983')], openlibrary: propiedad('P648'), musicbrainz: propiedad('P434') },
  };
}
