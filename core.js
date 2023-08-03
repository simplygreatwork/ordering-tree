
export function system_new(responder) {
	
	responder = responder || function() {}
	return { responder: responder }
}

export function system_emit(message, data) {
	if (system.responder) system.responder(message, data)
}

export function catalog_new(source) {
	
	let catalog = { source: source, tree: { name: '/', map: new Map() }, errors: [] }
	catalog_import(catalog, source)
	return catalog
}

export function catalog_import(catalog, source) {
	
	let tree = catalog.tree
	catalog.lines = source.split('\n')
	catalog.lines.forEach(function(line, index) {
		line = line.trim()
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
		node.price = node.price || 0
		if (entry.price_relative) entry.price = node.price + entry.price
		Object.assign(node, entry)
	})
	if (catalog.errors.length > 0) throw Error('Unstable catalog')
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
	if (columns[1].startsWith('+') || columns[1].startsWith('-')) entry.price_relative = true
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

export function order_new(source) {
	
	let order = { items: [] }
	order_import(order, source)
	return order
}

export function order_import(order, source) {
	
	source = source || ''
	order.lines = source.split('\n')
	order.lines.forEach(function(line, index) {
		if (line.length === 0) return
		order_parse_line(order, line)
	})
}

export function order_parse_line(order, line) {
	
	let columns = line.split(' ')
	let path = columns[0]
	let level = path.split('/').length - 1
	let quantity = parseInt(columns[1])
	let item
	if (level < 2) return 
	else if (level === 2) {
		order.items.push(item = order_item_create(path))
	} else if (item) {
		order_item_set(item, path, quantity)
	}
}

export function order_validate_node(order, node) {
	return
}

export function order_err(message, order, node) {
	return
}

export function order_append(order, path) {
	
	let item = order_item_create(path)
	order.items.push(item)
}

export function order_print(order) {
	
	let total = 0
	order.items.forEach(function(item) {
		order_item_walk_active(item, [item.node], Infinity, function(node) {
			if (node.quantity === 0) return
			let padding = ''.padStart(node.level / 2, ' ')
			let node_ = catalog_find(system.catalog, node.path).node
			total = total + node_.price
			let price = node_.price === 0 ? '' : ' $' + node_.price.toFixed(2)
			console.log(`${padding}${node_.label}${price} (${node.quantity})`)
		})
	})
	console.log(`Total: $${total}`)
}

export function order_validate(order) {
	
	let result = true
	order.items.forEach(function(item) {
		if (order_item_validate(item, order) === false) result = false
	})
	return result
}

export function order_serialize(order) {
	
	let array = []
	order.items.forEach(function(item) {
		order_item_serialize(item, array)
	})
	return array.join('\n') + '\n'
}

export function order_item_create(path) {
	
	let item = { path: path }
	let node = catalog_find(system.catalog, path).node
	item.node = structuredClone(node)
	item.node.quantity = 1
	order_item_deflate(item)
	return item
}

export function order_item_set(item, path, quantity) {
	
	order_item_inflate(item)
	let allowed = true
	let { node, parent } = order_item_find(item, path)
	let cat = catalog_find(system.catalog, path)
	if (quantity > 1 && ! cat.node.multiples) {
		allowed = false
	}
	if (allowed) {
		node.quantity = quantity
		order_item_deflate(item)
		system_emit(`order-item-set`, { item: item, path: path })
	} else {
		order_item_deflate(item)
		system_emit(`order-item-set-not`, { item: item, path: path, reason: 'multiples-forbidden' })
	}
}

export function order_item_increment(item, path) {
	
	order_item_inflate(item)
	let allowed = true
	let { node, parent } = order_item_find(item, path)
	let cat = catalog_find(system.catalog, path)
	if (cat.parent.single_select) {
		for (const sibling of parent.map.values()) {
			sibling.quantity = 0
		}
	}
	if (node.quantity > 0 && ! cat.node.multiples) {
		allowed = false
	}
	if (allowed) {
		node.quantity++
		order_item_deflate(item)
		system_emit(`order-item-incremented`, { item: item, path: path })
	} else {
		order_item_deflate(item)
		system_emit(`order-item-incremented-not`, { item: item, path: path, reason: 'multiples-forbidden' })
	}
}

export function order_item_decrement(item, path) {
	
	let node = order_item_find(item, path).node
	let parent = catalog_find(system.catalog, path).parent
	if (! parent.single_select && node.quantity > 0) {
		node.quantity--
		order_item_deflate(item)
		system_emit(`order-item-decremented`, { item: item, path: path })
	} else {
		system_emit(`order-item-decremented-not`, { item: item, path: path })
		order_item_deflate(item)
	}
}

export function order_item_find(item, path) {
	return find(item.node, path.split(item.path)[1])
}

export function order_item_deflate(item) {
	
	order_item_walk(item, [item.node], Infinity, function(node, treepath) {
		let parent = treepath[treepath.length - 2]
		if (! parent) return
		parent.map.set(node.name, {
			map: node.map,
			path: node.path,
			name: node.name,
			level: node.level,
			quantity: node.quantity
		})
	})
}

export function order_item_inflate(item) {
	
	order_item_walk(item, [item.node], Infinity, function(node) {
		let quantity = node.quantity
		let node_ = catalog_find(system.catalog, node.path)
		Object.assign(node, node_)
		node.quantity = quantity
	})
}

export function order_item_validate(item, order) {
	
	let result = true
	order_item_menus(item, function(data) {
		let menu = data.menu
		if (menu.single_select) {
			let items = Array.from(menu.map.values()).map(function(each) {
				return order_item_find(item, each.path).node
			}).filter(function(value) {
				return value.quantity > 0
			})
			if (items.length === 0) {
				result = false
				if (false) console.log(`invalid-menu-choice: ${menu.path}`)
				system_emit(`invalid-menu-choice`, { order: order, item: item, path: menu.path})
			}
		}
	})
	return result
}

export function order_item_serialize(item, array) {
	
	order_item_walk_active(item, [item.node], Infinity, function(node) {
		if (node.quantity === 0) return
		array.push(`${node.path} ${node.quantity}`)
	})
}

export function order_item_walk(item, array, depth, fn) {
	walk(array, depth, null, fn)
}

export function order_item_walk_active(item, array, depth, fn) {
	
	const filter = function(node, array, level) {
		if (level % 2 === 0 && node.quantity === 0) return false
		return true
	}
	walk(array, depth, filter, fn)
}

export function order_item_menus(item, fn) {
	
	let array = catalog_find(system.catalog, item.path).treepath
	const filter = function(node, array, level) {
		node = order_item_find(item, node.path).node
		if (level % 2 === 0 && node.quantity === 0) return false
		return true
	}
	catalog_walk(system.catalog, array, Infinity, filter, function(node, array) {
		let level = array.length - 1
		if (level % 2 === 0) return
		let items = Array.from(node.map.values()).map(function(each) {
			let result = {}
			Object.assign(result, each)
			Object.assign(result, order_item_find(item, each.path).node)
			return result
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
	return {
		path: path,
		treepath: treepath,
		node: treepath[treepath.length - 1],
		parent: treepath[treepath.length - 2]
	}
}

export function walk(treepath, depth, filter, fn) {
	
	depth = depth || Infinity
	filter = filter || function() { return true }
	if (treepath.length - 1 > depth) return
	let node = treepath[treepath.length - 1]
	if (! node.name) return
	fn(node, treepath)
	if (! filter(node, treepath, treepath.length - 1)) return
	for (const key of node.map.keys()) {
		let treepath_ = [...treepath, node.map.get(key)]
		walk(treepath_, depth, filter, fn)
	}
}
