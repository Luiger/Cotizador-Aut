const supabase = require('../config/supabaseClient');

/**
 * Busca una máquina en la base de datos por su nombre.
 * Utiliza una búsqueda flexible que no distingue mayúsculas/minúsculas.
 * @param {string} machineName - El nombre de la máquina extraído por Gemini.
 * @returns {Promise<object|null>} El objeto de la máquina si se encuentra, o null si no.
 */
const findMachineByName = async (machineName) => {
    try {
        // Dividimos el nombre en palabras para una búsqueda más flexible
        // ej. "minicargador bobcat" -> busca registros que contengan "minicargador" Y "bobcat"
        const searchTerms = machineName.split(' ').map(term => `${term}:*`).join(' & ');
        
        const { data, error } = await supabase
            .from('maquinaria')
            .select('*')
            // Usamos búsqueda de texto completo (full-text search) para mejores resultados
            .textSearch('nombre_modelo', searchTerms)
            .limit(1)
            .single(); // Devuelve un objeto en lugar de un array

        if (error) {
            // 'PGRST116' es el código de Supabase para "no se encontró ninguna fila"
            if (error.code === 'PGRST116') {
                console.log(`No se encontró la máquina "${machineName}" en la base de datos.`);
                return null;
            }
            // Si es otro tipo de error, lo lanzamos
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error al buscar máquina en Supabase:', error.message);
        return null;
    }
};

const getFullCatalog = async () => {
    try {
        const { data, error } = await supabase
            .from('maquinaria')
            .select('nombre_modelo, descripcion');
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error al obtener el catálogo completo:', error.message);
        return [];
    }
};

module.exports = { 
    findMachineByName,
    getFullCatalog
};