
export function system_new(responder) {
	
	responder = responder || function() {}
	return { responder: responder }
}

export function system_emit(message, data) {
	if (system.responder) system.responder(message, data)
}

export function catalog_new(source) {
	
	let catalog = { source: source, tree: { name: '', map: new Map() }, errors: [] }
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
		if (entry.alias) return catalog_alias(catalog, entry)
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

export function catalog_alias(catalog, entry) {
	
	let path = entry.path.split('/').slice(0, -1).join('/')
	let a = catalog_find(catalog, path)
	let b = catalog_find(catalog, entry.alias)
	let node = structuredClone(b.node)
	walk([node], Infinity, null, function(node, treepath) {
		node.path = a.node.path + node.path
	})
	let key = entry.path.split('/').slice(-1).join('/')
	a.node.map.set(key, node)
}

export function catalog_parse_line(catalog, line, index) {
	
	let parts = line.split(' ')
	let alias = parts.length > 1 && parts[1] == '='
	if (alias) return catalog_parse_line_alias(catalog, line, index)
	else if (line.includes(':')) return catalog_parse_line_props(catalog, line, index)
	else return catalog_parse_line_basic(catalog, line, index)
}

export function catalog_parse_line_basic(catalog, line, index) {
	
	let columns = line.split(' ')
	let parts = columns[0].split('/')
	let entry = {
		line: index,
		path : columns[0],
		name: parts[parts.length - 1],
		level : parts.length - 1,
		price : columns[1],
		label : columns[2],
		quantity: columns[3],
		single_select: 'no',
		multiples: 'no'
	}
	columns.slice(4).forEach(function(code) {
		if (code == '!') entry.single_select = 'yes'
		if (code == '#') entry.multiples = 'yes'
	})
	return catalog_parse_line_process(catalog, entry)
}

export function catalog_parse_line_props(catalog, line, index) {
	
	let columns = line.split(' ')
	let parts = columns[0].split('/')
	let entry = {
		line: index,
		path : columns[0],
		name: parts[parts.length - 1],
		level : parts.length - 1,
	}
	let dict = {}
	columns.forEach(function(each) {
		let pair = each.split(':')
		entry[pair[0]] = pair[1]
	})
	return catalog_parse_line_process(catalog, entry)
}

export function catalog_parse_line_alias(catalog, line, index) {
	
	let parts = line.split(' ')
	return {
		path: parts[0],
		alias: parts[2]
	}
}

export function catalog_parse_line_process(catalog, entry) {
	
	let price = entry.price
	if (price) {
		if (price.startsWith('+') || price.startsWith('-')) {
			entry.price_relative = true
		}
	}
	let quantity = entry.quantity
	if (quantity) {
		entry.quantity_default = quantity
	}
	const transforms = {
		label: function(value) { return value.replaceAll('_', ' ') },
		price: function(value) { return price_as_cents(parseFloat(value)) },
		quantity: function(value) { return parseInt(value) },
		quantity_default: function(value) { return parseInt(value) },
		single_select: function(value) { return value == 'yes' ? true : false },
		multiples: function(value) { return value == 'yes' ? true : false }
	}
	Object.keys(entry).forEach(function(key) {
		if (! transforms[key]) return
		entry[key] = transforms[key](entry[key])
	})
	catalog_validate_entry(catalog, entry)
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
	
	let order = { items: [], errors: [] }
	order_import(order, source)
	return order
}

export function order_import(order, source) {
	
	source = source || ''
	order.lines = source.split('\n')
	order.lines.forEach(function(line, index) {
		line = line.trim()
		if (line.length === 0) return
		let entry = order_parse_line(order, line, index)
		order_validate_entry(order, entry)
		let item
		let { level, path, quantity } = entry
		if (level < 2) return
		else if (level === 2) {
			order.items.push(item = order_item_create(path))
		} else if (item) {
			order_item_set(item, path, quantity)
		}
	})
	if (order.errors.length > 0) throw Error('Unstable order')
}

export function order_parse_line(order, line, index) {
	
	let columns = line.split(' ')
	return {
		line: index,
		path: columns[0],
		quantity: parseInt(columns[1]),
		level: columns[0].split('/').length - 1
	}
}

export function order_validate_entry(order, entry) {
	
	if (! entry.path.startsWith('/')) order_err('Path must begin with a slash', order, entry)
	if (entry.path.endsWith('/')) order_err('Path must not end with slash', order, entry)
	if (Number.isNaN(entry.quantity)) order_err('Quantity must be a numerical value', order, entry)
}

export function order_err(message, order, entry) {
	
	let errors = order.errors
	errors.push(`Catalog entry validation error: "${message}" ${entry.path} at line ${entry.line}`)
	console.error(errors[errors.length - 1])
}

export function order_append(order, path) {
	
	let item = order_item_create(path)
	order.items.push(item)
}

export function order_print(order) {
	
	order.items.forEach(function(item) {
		order_item_walk_active(item, [item.node], Infinity, function(node, treepath) {
			if (node.quantity === 0) return
			let padding = ''.padStart(node.level / 2, ' ')
			let { label, price } = catalog_find(system.catalog, node.path).node
			price = price === 0 ? '' : ' $' + price_as_dollars(price)
			console.log(`${padding}${label}${price} (${node.quantity})`)
		})
	})
	console.log(`Total: $${order_total(order)}`)
}

export function order_total(order) {
	
	let total = 0
	order.items.forEach(function(item) {
		order_item_walk_active(item, [item.node], Infinity, function(node, treepath) {
			if (node.quantity === 0) return
			let node_ = catalog_find(system.catalog, node.path).node
			let multiplier = 1
			treepath.filter(each => each.quantity > 0).forEach(function(each) {
				let quantity = each.quantity - node_.quantity_default
				if (quantity > 0) multiplier *= quantity
			})
			total += node_.price * multiplier
		})
	})
	return price_as_dollars(total)
	
	//  Charge for item quantities which are greater than the default quantity.
	//  If default quantity is 1 and quantity is 2, charge for the second only.
	//  If default quantity is 0 and quantity is 2, charge for first and second.
	//  Walk inside items only when the quantity is greater than zero.
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
	
	let treepath = catalog_find(system.catalog, item.node.path).treepath
	treepath[treepath.length - 1] = item.node
	walk(treepath, depth, null, fn)
}

export function order_item_walk_active(item, array, depth, fn) {
	
	const filter = function(node, array, level) {
		if (level % 2 === 0 && node.quantity === 0) return false
		return true
	}
	let treepath = catalog_find(system.catalog, item.node.path).treepath
	treepath[treepath.length - 1] = item.node
	walk(treepath, depth, null, fn)
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
	
	let treepath_ = treepath
	let magic = treepath.map(node => node.name).join('/')
	console.log(`magic: ${magic}`)
	depth = depth || Infinity
	filter = filter || function() { return true }
	if (treepath.length - 1 > depth) return
	let node = treepath[treepath.length - 1]
	if (node.name === null || node.name === undefined) return
	fn(node, treepath)
	if (! filter(node, treepath, treepath.length - 1)) return
	for (const key of node.map.keys()) {
		let node_ = node.map.get(key)
		// node_.name = key
		let treepath_ = [...treepath, node_]
		walk(treepath_, depth, filter, fn)
	}
}

export function walk_(treepath, depth, filter, fn) {
	
	depth = depth || Infinity
	filter = filter || function() { return true }
	if (treepath.length - 1 > depth) return
	let node = treepath[treepath.length - 1]
	if (node.name === null || node.name === undefined) return
	fn(node, treepath)
	if (! filter(node, treepath, treepath.length - 1)) return
	for (const key of node.map.keys()) {
		let treepath_ = [...treepath, node.map.get(key)]
		walk(treepath_, depth, filter, fn)
	}
}

export function price_as_cents(price) {
	return Math.floor(price * 100)
}

export function price_as_dollars(price) {
	return (price / 100).toFixed(2)
}
