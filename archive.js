
export function system_initialize(responder) {
	
	responder = responder || function() {}
	return { responder: responder }
}

export function system_emit(message, data) {
	if (system.responder) system.responder(message, data)
}

export function catalog_initialize(source) {
	
	let catalog = { source: source, tree: { map: new Map() }, errors: [] }
	let tree = catalog.tree
	catalog.lines = source.split('\n')
	catalog.lines.forEach(function(line, index) {
		if (line.length === 0) return
		let entry = catalog_parse_line(catalog, line, index)
		catalog_validate_entry(catalog, entry)
		let node = tree
		let parts = entry.path.split('/').slice(1)
		parts.forEach(function(part, index) {
			let value = node.map.get(part)
			if (! value) node.map.set(part, { map: new Map() })
			node = node.map.get(part)
		})
		node.price = 0
		if (entry.price_relative) entry.price = node.price + entry.price
		Object.assign(node, entry)
	})
	if (catalog.errors.length > 0) throw Error('Unstable catalog')
	return catalog
}

export function catalog_parse_line(catalog, line, index) {
	
	let columns = line.split(' ')
	let parts = columns[0].split('/')
	let entry = {
		line: index,
		path : columns[0],
		name: parts[parts.length - 1],
		level : parts.length - 1,
		price : parseFloat(columns[1]),
		price_relative : false,
		label : columns[2].replaceAll('_', ' '),
		quantity: parseInt(columns[3]),
		quantity_default: parseInt(columns[3]),
		single_select: false,
		multiples: false
	}
	if (columns[1].startsWith('+') || columns[1].startsWith('1')) entry.price_relative = true
	columns.slice(4).forEach(function(code) {
		if (code == '!') entry.single_select = true
		if (code == '#') entry.multiples = true
	})
	return entry
}

export function catalog_validate_entry(catalog, entry) {
	
	if (! entry.path.startsWith('/')) catalog_err('Path must begin with a slash', catalog, entry)
	if (entry.path.endsWith('/')) catalog_err('Path must not end with slash', catalog, entry)
	if (Number.isNaN(entry.price)) catalog_err('Price must be a numerical value', catalog, entry)
	if (Number.isNaN(entry.quantity)) catalog_err('Quantity must be a numerical value', catalog, entry)
}

export function catalog_err(message, catalog, entry) {
	
	let errors = catalog.errors
	errors.push(`Catalog entry validation error: "${message}" ${entry.path} at line ${entry.line}`)
	console.error(errors[errors.length - 1])
}

export function catalog_find(catalog, path) {
	return find(catalog.tree, path)
}

export function catalog_walk(catalog, treepath, depth, filter, fn) {
	walk(treepath, depth, filter, fn)
}

export function order_initialize() {
	
	let order = { items: [] }
	return order
}

export function order_import(order, source) {
	return
}

export function order_append(order, path) {
	
	let item = { path: path }
	item.array = catalog_find(system.catalog, path)
	let node = item.array[item.array.length - 1]
	item.node = structuredClone(node)
	item.node.quantity = 1
	order.items.push(item)
}

export function order_print(order) {
	
	order.items.forEach(function(item) {
		order_item_print(item)
	})
}

export function order_item_create(item, path) {
	return
}

export function order_item_increment(item, path) {
	
	let node = order_item_find(item, path)
	node.quantity++
}

export function order_item_decrement(item, path) {
	
	let node = order_item_find(item, path)
	node.quantity--
}

export function order_item_find(item, path) {
	return find(item.node, path.split(item.path)[1])
}

export function order_item_inflate(item) {
	return
}

export function order_item_deflate(item) {
	return
}

export function order_item_print(item) {
	
	order_item_walk(item, [item.node], Infinity, function(node) {
		let padding = ''.padStart(node.level / 2, ' ')
		let array = catalog_find(system.catalog, node.path)
		let node_ = array[array.length - 1]
		let price = node_.price === 0 ? '' : ' $' + node_.price.toFixed(2)
		console.log(`${padding}${node.label} ${node.quantity} ${price}`)
	})
}

export function order_item_walk(item, treepath, depth, fn) {
	
	let filter = function(node, treepath) {
		return ((treepath.length - 1) % 2 === 0 && node.quantity === 0)
	}
	walk(treepath, depth, filter, fn)
}

export function order_item_menus(item, fn) {
	
	let array = catalog_find(system.catalog, item.path)
	let filter = function(node, array) {
		let level = array.length - 1
		if (level % 2 === 1) return true
		let found = order_item_find(item, node.path)
		return found[found.length - 1].quantity > 0
	}
	catalog_walk(system.catalog, array, Infinity, filter, function(node, array) {
		let level = array.length - 1
		if (level % 2 === 0) return
		// console.log(`array_to_path: ${array_to_path(array)}`)
		let items = Array.from(node.map.values()).map(function(each) {
			let treepath = order_item_find(item, each.path)
			return treepath[treepath.length - 1]
		})
		fn({ menu: node, items: items })
	})
}

export function array_to_path(array) {
	
	let result = ['']
	array.slice(1).forEach(function(each, index) {
		result.push(each.name)
	})
	return result.join('/')
}

function find(node, path) {
	
	let treepath = []
	treepath.push(node)
	let parts = path.split('/').slice(1)
	parts.forEach(function(part) {
		node = node.map.get(part)
		treepath.push(node)
	})
	return treepath
}

export function walk(treepath, depth, filter, fn) {
	
	depth = depth || Infinity
	filter = filter || function() { return true }
	if (treepath.length - 1 > depth) return
	let node = treepath[treepath.length - 1]
	if (node && node.path) fn(node, treepath)
	if (! filter(node, treepath)) return
	for (const key of node.map.keys()) {
		let treepath_ = [...treepath, node.map.get(key)]
		walk(treepath_, depth, filter, fn)
	}
}
