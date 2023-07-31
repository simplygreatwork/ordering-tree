
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

export function order_initialize(source) {
	
	let order = { items: [] }
	order_import(order, source)
	return order
}

export function order_import(order, source) {
	
	source = source || ''
	order.lines = source.split('\n')
	order.lines.forEach(function(line, index) {
		if (line.length === 0) return
		let columns = line.split(' ')
		let path = columns[0]
		let level = path.split('/').length - 1
		let quantity = parseInt(columns[1])
		if (level === 2) {
			order.items.push(order_item_create(path))
		} else {
			if (order.items.length > 0) {
				let item = order.items[order.items.length - 1]
				let node = order_item_find(item, path).node
				node.quantity = quantity
			}
		}
	})
}

export function order_append(order, path) {
	
	let item = order_item_create(path)
	order.items.push(item)
}

export function order_print(order) {
	
	let total = 0
	order.items.forEach(function(item) {
		order_item_walk(item, [item.node], Infinity, function(node) {
			let padding = ''.padStart(node.level / 2, ' ')
			let node_ = catalog_find(system.catalog, node.path).node
			total = total + node_.price
			let price = node_.price === 0 ? '' : ' $' + node_.price.toFixed(2)
			console.log(`${padding}${node.label} ${node.quantity} ${price}`)
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
	return array.join('\n')
}

export function order_item_create(path) {
	
	let item = { path: path }
	let node = catalog_find(system.catalog, path).node
	item.node = structuredClone(node)
	item.node.quantity = 1
	return item
}

export function order_item_increment(item, path) {
	
	order_item_inflate(item)
	let allowed = true
	let { node, parent } = order_item_find(item, path)
	let cat = catalog_find(system.catalog, path)
	if (cat.parent && cat.parent.single_select) {
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

export function order_item_inflate(item) {
	return
}

export function order_item_deflate(item) {
	return
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
				console.log(`invalid-menu-choice: ${menu.path}`)
				system_emit(`invalid-menu-choice`, { order: order, item: item, path: menu.path})
			}
		}
	})
	return result
}

export function order_item_serialize(item, array) {
	
	order_item_walk(item, [item.node], Infinity, function(node) {
		if (node.quantity > 0) {
			array.push(`${node.path} ${node.quantity}`)
		}
	})
}

export function order_item_walk(item, array, depth, fn) {
	
	depth = depth || Infinity
	if (array.length - 1 > depth) return
	let node = array[array.length - 1]
	if (node && node.quantity > 0) fn(node)
	let level = array.length - 1
	if (level % 2 === 0 && node.quantity === 0) return
	for (const key of node.map.keys()) {
		let array_ = [...array, node.map.get(key)]
		order_item_walk(system.catalog, array_, depth, fn)
	}
}

export function order_item_menus(item, fn) {
	
	let array = catalog_find(system.catalog, item.path).treepath
	let filter = function(node, array) {
		let level = array.length - 1
		if (level % 2 === 1) return true
		let node_ = order_item_find(item, node.path).node
		return node_.quantity > 0
	}
	catalog_walk(system.catalog, array, Infinity, filter, function(node, array) {
		let level = array.length - 1
		if (level % 2 === 0) return
		let items = Array.from(node.map.values()).map(function(each) {
			return order_item_find(item, each.path).node
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
	if (node && node.path) fn(node, treepath)
	if (! filter(node, treepath)) return
	for (const key of node.map.keys()) {
		let treepath_ = [...treepath, node.map.get(key)]
		walk(treepath_, depth, filter, fn)
	}
}
